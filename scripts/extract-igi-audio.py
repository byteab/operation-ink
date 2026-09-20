#!/usr/bin/env python3
"""Extract the supplied IGI common PCM archive and install a curated game sound bank.

No executable from the supplied game is run. Python standard library only.
"""
import argparse
import array
import hashlib
import json
from pathlib import Path
import struct
import sys
import wave

ROOT = Path(__file__).resolve().parent.parent


def read_archive(path):
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b'ILFF' or data[16:20] != b'IRES':
        raise ValueError('Expected an ILFF/IRES archive')
    if struct.unpack_from('<I', data, 4)[0] != len(data):
        raise ValueError('Archive length mismatch')
    position, name, sounds = 20, None, {}
    while position < len(data):
        if position + 16 > len(data):
            raise ValueError('Truncated chunk header')
        tag, size, alignment, span = struct.unpack_from('<4sIII', data, position)
        end = position + 16 + size
        if alignment != 4 or end > len(data):
            raise ValueError('Invalid chunk bounds/alignment')
        payload = data[position + 16:end]
        if tag == b'PATH' and span == 0 and end == len(data):
            break  # Final archive path index, not an audio resource.
        if span < 16 + size or position + span > len(data) or span % 4:
            raise ValueError('Invalid chunk stride')
        if tag == b'NAME':
            name = payload.rstrip(b'\0').decode('ascii')
        elif tag == b'BODY':
            if name is None or len(payload) < 20:
                raise ValueError('Audio body without name/header')
            magic, codec, bits, channels, flags, rate, frames = struct.unpack_from('<4sHHHHII', payload)
            if magic != b'ILSF' or codec != 1 or bits != 16 or channels not in (1, 2) or flags != 0x1002 or not 8000 <= rate <= 96000:
                raise ValueError(f'Unsupported sound encoding: {name}')
            pcm = payload[20:]
            if len(pcm) != frames * channels * 2:
                raise ValueError(f'PCM frame count mismatch: {name}')
            # Never use archive paths as filesystem paths.
            filename = name.replace('\\', '/').split('/')[-1]
            if not filename.endswith('.wav') or filename in sounds:
                raise ValueError(f'Invalid or duplicate filename: {name}')
            sounds[filename] = dict(source=name, channels=channels, rate=rate, frames=frames, pcm=pcm)
            name = None
        else:
            raise ValueError(f'Unexpected chunk {tag!r}')
        position += span
    return sounds


def write_wav(path, sound):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as out:
        out.setparams((sound['channels'], 2, sound['rate'], 0, 'NONE', 'not compressed'))
        out.writeframes(sound['pcm'])


def single_shot(attack, tail, seconds):
    if attack['channels'] != 1 or tail['channels'] != 1 or attack['rate'] != tail['rate']:
        raise ValueError('Shot edits require matching mono sources')
    a, b = array.array('h', attack['pcm']), array.array('h', tail['pcm'])
    if sys.byteorder != 'little':
        a.byteswap(); b.byteswap()
    a = a[:round(seconds * attack['rate'])]
    overlap = round(0.008 * attack['rate'])
    for i in range(overlap):
        mix = i / (overlap - 1)
        a[len(a) - overlap + i] = round(a[len(a) - overlap + i] * (1 - mix) + b[i] * mix)
    a.extend(b[overlap:])
    # Short fades remove any discontinuity at the new file boundaries.
    for i in range(round(0.001 * attack['rate'])):
        a[i] = round(a[i] * i / round(0.001 * attack['rate']))
    for i in range(round(0.005 * attack['rate'])):
        a[-1-i] = round(a[-1-i] * i / round(0.005 * attack['rate']))
    if sys.byteorder != 'little':
        a.byteswap()
    return dict(source=[attack['source'], tail['source']], channels=1, rate=attack['rate'],
                frames=len(a), pcm=a.tobytes(), edit=f'First {seconds}s of burst; 8ms crossfade into decay; 1ms/5ms boundary fades')


def selected_names():
    names = ['glock_shot_1', 'glock_shot_2', 'svddrag_shot_1', 'spas12_shot_1',
             'spas12_reload_1', 'spas12_reload_2', 'door_open_1',
             'weaponpickup_1', 'new_gun', 'guns_dry_1', 'ak47_reload_1', 'ak47_reload_3', 'alarm_1']
    for prefix, count, padding in [('walk_gravel_', 6, 1), ('walk_ladder_', 4, 1),
                                    ('spas12_bulins_', 4, 1),
                                    ('detected_', 6, 2), ('bul_concrete_', 2, 1),
                                    ('bul_flesh_', 5, 1), ('bodyfall_', 9, 1),
                                    ('ai_hit_', 3, 2), ('player_hit_', 4, 1), ('weapondrop_', 2, 2)]:
        names.extend(f'{prefix}{i:0{padding}d}' for i in range(1, count + 1))
    return [name + '.wav' for name in names]


def pump_cycle(back, forward):
    """Preserve both original SPAS mechanism strokes in the game's one pump event."""
    if back['channels'] != forward['channels'] or back['rate'] != forward['rate']:
        raise ValueError('Pump edits require matching source formats')
    gap_frames = round(0.02 * back['rate'])
    pcm = back['pcm'] + b'\0' * (gap_frames * back['channels'] * 2) + forward['pcm']
    return dict(source=[back['source'], forward['source']], channels=back['channels'], rate=back['rate'],
                frames=back['frames'] + gap_frames + forward['frames'], pcm=pcm,
                edit='Complete SPAS-12 reload_1 then reload_2 mechanism strokes; 20ms silent gap; original PCM and sample rate')


def curated_sounds(sounds):
    selected = {name: sounds[name] for name in selected_names()}
    selected['ak47_single.wav'] = single_shot(sounds['ak47_loop.wav'], sounds['ak47_loop_e.wav'], 0.085)
    selected['mp5sd_single.wav'] = single_shot(sounds['mp5sd_loop.wav'], sounds['mp5sd_loop_e.wav'], 0.05)
    selected['spas12_pump.wav'] = pump_cycle(sounds['spas12_reload_1.wav'], sounds['spas12_reload_2.wav'])
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'project-igi-files/pc/common/sounds/sounds.res')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/igi-audio.local')
    parser.add_argument('--game-output', type=Path, default=ROOT / 'public/sounds/igi')
    parser.add_argument('--curated-only', action='store_true', help='Install only the curated game bank, skipping full archive export')
    args = parser.parse_args()
    sounds = read_archive(args.source)
    if not args.curated_only:
        for name, sound in sounds.items():
            write_wav(args.output / name, sound)
    selected = curated_sounds(sounds)
    entries = []
    for name, sound in selected.items():
        target = args.game_output / name
        write_wav(target, sound)
        entries.append(dict(file=name, source=sound['source'], sampleRate=sound['rate'],
                            channels=sound['channels'], frames=sound['frames'],
                            duration=round(sound['frames'] / sound['rate'], 6),
                            edit=sound.get('edit', 'Lossless PCM rewrap; original sample rate'),
                            sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    manifest = dict(sourceArchive='project-igi-files/pc/common/sounds/sounds.res',
                    sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
                    extractedCount=len(sounds), assets=entries)
    (args.game_output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if not args.curated_only:
        print(f'Extracted {len(sounds)} WAV files to {args.output}')
    print(f'Installed {len(selected)} game samples ({sum(44 + len(s["pcm"]) for s in selected.values()):,} bytes) to {args.game_output}')


if __name__ == '__main__':
    main()
