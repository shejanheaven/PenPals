"""Optional: upload the finished video to a Facebook Page as a Reel.

Needs FB_PAGE_ID and FB_PAGE_TOKEN (a Page access token with pages_show_list,
pages_read_engagement and pages_manage_posts). See README -> "Auto-posting".
Flow: start upload session -> send bytes to rupload.facebook.com -> finish/publish.
"""

from __future__ import annotations

import time
from pathlib import Path

import requests

from .config import Settings
from .util import log


class PublishError(RuntimeError):
    pass


def _check(resp: requests.Response, step: str) -> dict:
    try:
        data = resp.json()
    except ValueError:
        data = {"raw": resp.text[:300]}
    if resp.status_code >= 400 or (isinstance(data, dict) and "error" in data):
        err = data.get("error", data) if isinstance(data, dict) else data
        raise PublishError(f"Facebook {step} failed: {err}")
    return data


def publish_reel(settings: Settings, video: Path, description: str,
                 state: str = "PUBLISHED") -> str:
    if not (settings.fb_page_id and settings.fb_page_token):
        raise PublishError("Set FB_PAGE_ID and FB_PAGE_TOKEN in .env to auto-post.")
    graph = f"https://graph.facebook.com/{settings.fb_graph_version}"
    token = settings.fb_page_token
    page = settings.fb_page_id

    log("Uploading Reel to Facebook...")
    start = _check(requests.post(f"{graph}/{page}/video_reels",
                                 data={"upload_phase": "start", "access_token": token},
                                 timeout=60), "start")
    video_id = start.get("video_id")
    upload_url = start.get("upload_url") or (
        f"https://rupload.facebook.com/video-upload/{settings.fb_graph_version}/{video_id}")
    if not video_id:
        raise PublishError(f"Facebook did not return a video id: {start}")

    size = video.stat().st_size
    with open(video, "rb") as fh:
        _check(requests.post(upload_url, data=fh, timeout=900, headers={
            "Authorization": f"OAuth {token}",
            "offset": "0",
            "file_size": str(size),
        }), "upload")

    _check(requests.post(f"{graph}/{page}/video_reels", data={
        "access_token": token,
        "video_id": video_id,
        "upload_phase": "finish",
        "video_state": state,
        "description": description,
    }, timeout=120), "publish")

    # Processing happens in the background; report status for a little while.
    for _ in range(12):
        time.sleep(10)
        try:
            info = requests.get(f"{graph}/{video_id}", timeout=30,
                                params={"fields": "status", "access_token": token}).json()
        except (requests.RequestException, ValueError):
            break
        status = (info.get("status") or {}).get("video_status")
        if status in ("ready", "published"):
            break
        if status == "error":
            raise PublishError(f"Facebook processing error: {info.get('status')}")
    log(f"Facebook Reel submitted (video id {video_id}).")
    return str(video_id)
