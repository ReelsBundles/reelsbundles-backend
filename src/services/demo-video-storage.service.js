import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'demo-videos.json');

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify([
            {
                id: "vid_demo_1",
                title: "Instagram Viral Reels Bundle Preview",
                youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                videoId: "dQw4w9WgXcQ",
                category: "General",
                active: true,
                createdAt: new Date().toISOString()
            }
        ], null, 2), 'utf8');
    }
}

export function extractYouTubeId(url) {
    if (!url) return '';
    const cleanUrl = String(url).trim();
    const matchV = cleanUrl.match(/[?&]v=([^&]+)/);
    if (matchV) return matchV[1];
    const matchBe = cleanUrl.match(/youtu\.be\/([^?&]+)/);
    if (matchBe) return matchBe[1];
    const matchEmbed = cleanUrl.match(/youtube\.com\/embed\/([^?&]+)/);
    if (matchEmbed) return matchEmbed[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) return cleanUrl;
    return cleanUrl;
}

export function getAllVideos() {
    ensureFile();
    try {
        const raw = fs.readFileSync(FILE_PATH, 'utf8');
        return JSON.parse(raw) || [];
    } catch {
        return [];
    }
}

export function getActiveVideos() {
    return getAllVideos().filter(v => v.active !== false);
}

export function saveVideos(videos) {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(videos, null, 2), 'utf8');
}

export function addVideo(data) {
    const videos = getAllVideos();
    const videoId = extractYouTubeId(data.youtubeUrl || data.videoId);
    if (!videoId) throw new Error("Valid YouTube URL or Video ID is required");

    const newVideo = {
        id: "vid_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        title: String(data.title || "Reels Bundle Demo").trim(),
        youtubeUrl: data.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`,
        videoId: videoId,
        category: String(data.category || "General").trim(),
        active: data.active !== false,
        createdAt: new Date().toISOString()
    };

    videos.push(newVideo);
    saveVideos(videos);
    return newVideo;
}

export function toggleVideo(id) {
    const videos = getAllVideos();
    const video = videos.find(v => v.id === id);
    if (!video) throw new Error("Video not found");
    video.active = !video.active;
    saveVideos(videos);
    return video;
}

export function deleteVideo(id) {
    let videos = getAllVideos();
    const initialLen = videos.length;
    videos = videos.filter(v => v.id !== id);
    if (videos.length === initialLen) throw new Error("Video not found");
    saveVideos(videos);
    return true;
}
