"""Download curated official trailers and encode small H.264 catalog previews.

Requires yt-dlp and FFmpeg. Run with --ffmpeg PATH if FFmpeg is not on PATH.
Sources are deliberately reviewed, rather than silently selecting unrelated uploads.
"""
import argparse
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'apps/web/public/brand/games/previews'
SOURCES = Path(__file__).with_name('game-preview-sources.json')

def command(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=240)
    if result.returncode:
        raise RuntimeError(result.stderr[-1600:])
    return result.stdout

def download(source, ffmpeg):
    slug = source['slug']
    with tempfile.TemporaryDirectory(prefix=f'{slug}-', dir=ROOT / 'tmp') as work:
        work = Path(work)
        command(['yt-dlp', '--no-playlist', '--js-runtimes', 'node', '--socket-timeout', '20',
                 '--retries', '2', '--no-progress', '--write-info-json',
                 '-f', 'bestvideo[height<=720]/best[height<=720]',
                 '-o', str(work / 'source.%(ext)s'), source['url']])
        info = json.loads((work / 'source.info.json').read_text(encoding='utf-8'))
        if info.get('channel_id') != source['channel_id']:
            raise ValueError(f'{slug}: publisher channel mismatch')
        if info.get('upload_date', '99999999') > datetime.date.today().strftime('%Y%m%d'):
            raise ValueError(f'{slug}: source is dated in the future')
        media = next(p for p in work.glob('source.*') if p.suffix in {'.mp4', '.webm', '.mkv'})
        clip = work / 'preview.mp4'
        command([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(source.get('start', 4)),
                 '-i', str(media), '-t', '12', '-an', '-vf', "scale=w='min(960,iw)':h=-2,fps=24",
                 '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-pix_fmt', 'yuv420p',
                 '-movflags', '+faststart', str(clip)])
        command([ffmpeg, '-v', 'error', '-xerror', '-i', str(clip), '-f', 'null', '-'])
        destination = OUTPUT / f'{slug}.mp4'
        os.replace(clip, destination)
        record = {**source, 'title': info['title'], 'channel': info['channel'],
                  'published': info['upload_date'], 'downloaded': datetime.date.today().isoformat(),
                  'file': f'{slug}.mp4', 'bytes': destination.stat().st_size,
                  'codec': 'h264', 'max_duration_seconds': 12}
        # Preserve each completed result so interrupted runs can resume.
        (ROOT / f'tmp/preview-{slug}.json').write_text(json.dumps(record, indent=2, ensure_ascii=True) + '\n')
        print(f'{slug}: OK ({record["bytes"]:,} bytes; published {record["published"]})', flush=True)
        return record

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--only', nargs='*')
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    sources = json.loads(SOURCES.read_text())
    (ROOT / 'tmp').mkdir(exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    results, failures, pending = [], [], []
    for source in sources:
        if args.only and source['slug'] not in args.only:
            continue
        cached = ROOT / f'tmp/preview-{source["slug"]}.json'
        if args.resume and cached.exists():
            record = json.loads(cached.read_text())
            target = OUTPUT / record['file']
            if record['url'] == source['url'] and target.exists() and target.stat().st_size == record['bytes']:
                results.append(record)
                continue
        pending.append(source)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = {pool.submit(download, source, args.ffmpeg): source for source in pending}
        for job in concurrent.futures.as_completed(jobs):
            try:
                results.append(job.result())
            except Exception as error:
                slug = jobs[job]['slug']
                failures.append(slug)
                print(f'{slug}: FAILED {error}', flush=True)
    if not failures and not args.only:
        (OUTPUT / 'sources.json').write_text(json.dumps(sorted(results, key=lambda r:r['slug']), indent=2, ensure_ascii=True) + '\n')
    if failures:
        raise SystemExit(f'Failed: {", ".join(failures)}')

if __name__ == '__main__':
    main()
