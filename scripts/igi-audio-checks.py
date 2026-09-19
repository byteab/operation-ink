"""Validate archive extraction, curated PCM integrity, and rejection of corrupt input."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import wave

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('extract_igi', ROOT / 'scripts/extract-igi-audio.py')
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)
source = ROOT / 'project-igi-files/pc/common/sounds/sounds.res'
manifest = json.loads((ROOT / 'public/sounds/igi/manifest.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest['sourceSha256']
sounds = extract.read_archive(source)
selected = extract.curated_sounds(sounds)
assert set(selected) == {asset['file'] for asset in manifest['assets']}
assert len(sounds) == manifest['extractedCount'] == 333
for name, sound in sounds.items():
    assert len(sound['pcm']) == sound['frames'] * sound['channels'] * 2
assert any(sound['channels'] == 2 for sound in sounds.values())
for asset in manifest['assets']:
    path = ROOT / 'public/sounds/igi' / asset['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == asset['sha256']
    with wave.open(str(path)) as wav:
        assert wav.getnchannels() == asset['channels']
        assert wav.getframerate() == asset['sampleRate']
        assert wav.getnframes() == asset['frames']
        assert wav.getsampwidth() == 2
        pcm = wav.readframes(wav.getnframes())
        assert any(pcm), f'Silent sound: {path}'
        if isinstance(asset['source'], str):
            assert pcm == sounds[asset['source'].split('/')[-1]]['pcm']
        else:
            assert pcm == selected[asset['file']]['pcm'], f'Derived PCM differs from its source edit: {path}'
            assert asset['duration'] < 1
            if asset['file'] != 'spas12_pump.wav':
                assert pcm[:2] == pcm[-2:] == b'\0\0'
        assert asset['source'] == selected[asset['file']]['source']
print(f'PASS 333 archive entries; {len(manifest["assets"])} deployed WAVs have correct hashes, rates, frames, and PCM payloads')
shot = selected['spas12_shot_1.wav']
assert shot['pcm'] == sounds['spas12_shot_1.wav']['pcm'] and shot['rate'] == 44100
pump = selected['spas12_pump.wav']
back, forward = sounds['spas12_reload_1.wav'], sounds['spas12_reload_2.wav']
assert pump['pcm'].startswith(back['pcm']) and pump['pcm'].endswith(forward['pcm'])
assert pump['pcm'][len(back['pcm']):-len(forward['pcm'])] == b'\0' * (441 * 2)
assert 0.49 < pump['frames'] / pump['rate'] < 0.51
print('PASS Original SPAS-12 report and four shell clips are lossless; pump preserves both ordered mechanism strokes with a 20ms gap')
with tempfile.TemporaryDirectory() as temporary:
    for mode in ['truncated', 'bad-stride', 'bad-codec', 'bad-frames']:
        data = bytearray(source.read_bytes())
        if mode == 'truncated':
            data = data[:-1]
        elif mode == 'bad-stride':
            struct.pack_into('<I', data, 32, 4)
        else:
            body = data.index(b'BODY') + 16
            struct.pack_into('<H' if mode == 'bad-codec' else '<I', data,
                             body + (4 if mode == 'bad-codec' else 16), 999)
        path = Path(temporary) / 'bad.res'
        path.write_bytes(data)
        try:
            extract.read_archive(path)
        except ValueError:
            pass
        else:
            raise AssertionError(f'Accepted {mode} archive')
print('PASS truncated archives, invalid strides, unsupported codecs, and corrupt PCM lengths are rejected')
