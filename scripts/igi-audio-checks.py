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
            assert asset['duration'] < 1 and pcm[:2] == pcm[-2:] == b'\0\0'
print(f'PASS 333 archive entries; {len(manifest["assets"])} deployed WAVs have correct hashes, rates, frames, and PCM payloads')
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
