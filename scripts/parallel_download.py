"""
Robust Multi-Threaded Parallel Downloader for Kokoro & Voice Assets
Splits files into parallel Range requests so downloads compete fairly with heavy background pulls
and resume seamlessly if connections drop.
"""
import sys
import time
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

def download_chunk(url, start, end, filepath, chunk_id, progress_callback, max_retries=50):
    headers = {"Range": f"bytes={start}-{end}", "User-Agent": "Mozilla/5.0"}
    for attempt in range(max_retries):
        try:
            with requests.get(url, headers=headers, stream=True, timeout=30) as r:
                if r.status_code not in (200, 206):
                    raise Exception(f"HTTP {r.status_code}")
                with open(filepath, "r+b") as f:
                    f.seek(start)
                    for data in r.iter_content(chunk_size=65536):
                        if data:
                            f.write(data)
                            progress_callback(len(data))
                return True
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"\n[Chunk {chunk_id}] Failed after {max_retries} attempts: {e}")
                raise
            time.sleep(min(2 + attempt, 10))

def parallel_download(url, dest_path, num_workers=8):
    print(f"\nTarget: {dest_path}")
    print(f"Connecting to {url[:60]}...")
    
    # Get total size
    r = requests.head(url, allow_redirects=True, timeout=15)
    total_size = int(r.headers.get("Content-Length", 0))
    final_url = r.url
    accept_ranges = "bytes" in r.headers.get("Accept-Ranges", "")
    
    if total_size == 0 or not accept_ranges:
        print(f"Server does not support ranges. Falling back to single-stream streaming...")
        r = requests.get(final_url, stream=True, timeout=15)
        with open(dest_path, "wb") as f:
            downloaded = 0
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
                downloaded += len(chunk)
                print(f"\rDownloaded {downloaded / 1024 / 1024:.2f} MB", end="")
        print("\nComplete!")
        return

    print(f"Size: {total_size / 1024 / 1024:.2f} MB | Threads: {num_workers} | Server: {r.headers.get('Server', 'CDN')}")
    
    # Pre-allocate destination file
    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.seek(total_size - 1)
        f.write(b"\0")
    
    # Calculate chunk ranges
    chunk_size = total_size // num_workers
    ranges = []
    for i in range(num_workers):
        start = i * chunk_size
        end = total_size - 1 if i == num_workers - 1 else (start + chunk_size - 1)
        ranges.append((start, end))

    downloaded = 0
    t0 = time.time()
    
    def on_progress(bytes_len):
        nonlocal downloaded
        downloaded += bytes_len
        elapsed = time.time() - t0
        speed_kb = (downloaded / 1024) / max(elapsed, 0.01)
        pct = (downloaded / total_size) * 100
        mb = downloaded / (1024 * 1024)
        total_mb = total_size / (1024 * 1024)
        bar_len = 30
        filled = int(bar_len * pct // 100)
        bar = "=" * filled + "-" * (bar_len - filled)
        sys.stdout.write(f"\r[{bar}] {pct:5.1f}% ({mb:5.1f}/{total_mb:5.1f} MB) @ {speed_kb:6.1f} KB/s  ")
        sys.stdout.flush()

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = [
            executor.submit(download_chunk, final_url, start, end, dest_path, i, on_progress)
            for i, (start, end) in enumerate(ranges)
        ]
        for f in as_completed(futures):
            f.result()

    elapsed = time.time() - t0
    final_speed = (total_size / 1024 / 1024) / max(elapsed, 0.01)
    print(f"\n[OK] Completed in {elapsed:.1f}s (Average: {final_speed:.2f} MB/s)")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python parallel_download.py <url> <dest_path> [num_workers]")
        sys.exit(1)
    url = sys.argv[1]
    dest = sys.argv[2]
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    parallel_download(url, dest, workers)
