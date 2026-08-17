import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'demo-videos.json');

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2), 'utf8');
    }
}

export function extractYouTubeId(url) {
    if (!url) return '';
    const cleanUrl = String(url).trim();
    const matchShorts = cleanUrl.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (matchShorts) return matchShorts[1];
    const matchV = cleanUrl.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (matchV) return matchV[1];
    const matchBe = cleanUrl.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (matchBe) return matchBe[1];
    const matchEmbed = cleanUrl.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
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

export async function fetchVideosAsync() {
    ensureFile();
    let items = getAllVideos();

    try {
        if (db) {
            const snapshot = await db.collection("demo_videos").get();
            if (!snapshot.empty) {
                const remote = [];
                snapshot.forEach(doc => remote.push({ id: doc.id, ...doc.data() }));

                remote.forEach(rItem => {
                    if (!items.some(lItem => lItem.id === rItem.id || (lItem.videoId && lItem.videoId === rItem.videoId))) {
                        items.push(rItem);
                    }
                });
                saveVideos(items);
            }
        }
    } catch (e) {
        console.warn("[DEMO VIDEOS] Firestore sync warning:", e?.message);
    }

    return items;
}

export function getActiveVideos() {
    return getAllVideos().filter(v => v.active !== false);
}

export async function getActiveVideosAsync() {
    const all = await fetchVideosAsync();
    return all.filter(v => v.active !== false);
}

export function saveVideos(videos) {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(videos, null, 2), 'utf8');
}

export async function addVideo(data) {
    const videos = getAllVideos();
    const videoId = extractYouTubeId(data.youtubeUrl || data.videoId);
    if (!videoId) throw new Error("Valid YouTube URL or Video ID is required");

    const isShort = String(data.videoType || "").toLowerCase() === "short" || String(data.youtubeUrl || "").includes("/shorts/");
    const newVideo = {
        id: "vid_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        title: String(data.title || "Reels Bundle Demo").trim(),
        youtubeUrl: data.youtubeUrl || (isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`),
        videoId: videoId,
        videoType: isShort ? "short" : "video",
        category: String(data.category || "General").trim(),
        active: data.active !== false,
        createdAt: new Date().toISOString()
    };

    videos.push(newVideo);
    saveVideos(videos);

    try {
        if (db) {
            await db.collection("demo_videos").doc(newVideo.id).set(newVideo);
        }
    } catch (e) {
        console.warn("[DEMO VIDEO] Firestore write warning:", e?.message);
    }

    return newVideo;
}

export async function toggleVideo(id) {
    const videos = getAllVideos();
    const video = videos.find(v => v.id === id);
    if (!video) throw new Error("Video not found");
    video.active = !video.active;
    saveVideos(videos);

    try {
        if (db) {
            await db.collection("demo_videos").doc(id).update({ active: video.active });
        }
    } catch (e) {}

    return video;
}

export async function deleteVideo(id) {
    let videos = getAllVideos();
    const initialLen = videos.length;
    videos = videos.filter(v => v.id !== id);
    if (videos.length === initialLen) throw new Error("Video not found");
    saveVideos(videos);

    try {
        if (db) {
            await db.collection("demo_videos").doc(id).delete();
        }
    } catch (e) {}

    return true;
}
