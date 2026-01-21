import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, doc, updateDoc, getDocs, deleteDoc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// --- Gemini AI Config ---
const GEMINI_API_KEY = "AIzaSyCKt0z_CYh9qJ5giYGtiyefv7dQRY822L8";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- DOM Elements ---
const coursesContainer = document.getElementById('courses-container');
const coursesListDiv = document.getElementById('courses-list');
const unitsContainer = document.getElementById('units-container');
const unitsListDiv = document.getElementById('units-list');
const notesContainer = document.getElementById('notes-container');
const notesListDiv = document.getElementById('notes-list');

const courseNameInput = document.getElementById('course-name-input');
const unitNameInput = document.getElementById('unit-name-input');
const noteTextInput = document.getElementById('note-text-input');
const noteCategoryInput = document.getElementById('note-category-input');
const searchNotesInput = document.getElementById('search-notes');

const selectedCourseTitle = document.getElementById('selected-course-title');
const selectedUnitTitle = document.getElementById('selected-unit-title');
const selectedKeywordDisplay = document.getElementById('selected-keyword-display');

// --- State ---
let selectedCourseId = null;
let selectedUnitId = null;
let selectedKeyword = '';
let unsubscribeNotes = null;
let currentEdit = { type: null, id: null, originalData: null };
let currentAiChatNote = null;

// --- Icons ---
const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
const aiIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.5 3.5 0 0 0 3.5 8c0 2.2 1.8 4 4 4h9c2.2 0 4-1.8 4-4s-1.8-4-4-4c-.5 0-1 .1-1.5.3A3.5 3.5 0 0 0 12 3z"></path><path d="M12 12v9"></path><path d="m9 21 6-6"></path></svg>`;

// --- Navigation ---
const showCourses = () => {
    coursesContainer.style.display = 'block';
    unitsContainer.style.display = 'none';
    notesContainer.style.display = 'none';
};

const showUnits = (courseId, courseName) => {
    selectedCourseId = courseId;
    selectedCourseTitle.textContent = courseName;
    coursesContainer.style.display = 'none';
    unitsContainer.style.display = 'block';
    notesContainer.style.display = 'none';
    displayUnits();
};

const showNotes = (unitId, unitName) => {
    selectedUnitId = unitId;
    selectedUnitTitle.textContent = unitName;
    unitsContainer.style.display = 'none';
    notesContainer.style.display = 'block';
    displayNotes();
};

// --- Display Functions ---
const displayCourses = () => {
    onSnapshot(query(collection(db, 'courses'), orderBy('createdAt', 'desc')), (snapshot) => {
        coursesListDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const course = doc.data();
            const div = document.createElement('div');
            div.className = 'course-card';
            div.innerHTML = `<div class="course-card-header"><span class="course-name">${course.name}</span></div>`;
            div.onclick = () => showUnits(doc.id, course.name);
            coursesListDiv.appendChild(div);
        });
    });
};

const displayUnits = () => {
    onSnapshot(query(collection(db, `courses/${selectedCourseId}/units`), orderBy('createdAt', 'desc')), (snapshot) => {
        unitsListDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const unit = doc.data();
            const div = document.createElement('div');
            div.className = 'unit-item';
            div.innerHTML = `<span class="unit-name">${unit.name}</span>`;
            div.onclick = () => showNotes(doc.id, unit.name);
            unitsListDiv.appendChild(div);
        });
    });
};

const displayNotes = () => {
    if (unsubscribeNotes) unsubscribeNotes();
    const q = query(collection(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`), orderBy('createdAt', 'desc'));
    
    unsubscribeNotes = onSnapshot(q, (snapshot) => {
        notesListDiv.innerHTML = '';
        snapshot.forEach(docSnap => {
            renderNoteCard(docSnap.id, docSnap.data());
        });
    });
};

const renderNoteCard = (id, data) => {
    const div = document.createElement('div');
    div.className = 'note-item';
    div.innerHTML = `
        <div class="note-content">
            <p>${data.noteText}</p>
            ${data.category ? `<span class="category">${data.category}</span>` : ''}
        </div>
        <div class="note-actions">
            <button class="ai-btn" title="AI Asistan">${aiIcon}</button>
            <button class="edit-btn" title="Düzenle">${editIcon}</button>
            <button class="delete-btn" title="Sil">${deleteIcon}</button>
        </div>
    `;

    div.querySelector('.delete-btn').onclick = () => deleteDoc(doc(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`, id));
    div.querySelector('.edit-btn').onclick = () => openEditModal('note', id, data);
    div.querySelector('.ai-btn').onclick = () => openAiChatModal(data.noteText);
    
    notesListDiv.appendChild(div);
};

// --- Add Operations ---
document.getElementById('add-course-btn').onclick = async () => {
    const name = courseNameInput.value.trim();
    if (name) {
        await addDoc(collection(db, 'courses'), { name, createdAt: new Date() });
        courseNameInput.value = '';
    }
};

document.getElementById('add-unit-btn').onclick = async () => {
    const name = unitNameInput.value.trim();
    if (name && selectedCourseId) {
        await addDoc(collection(db, `courses/${selectedCourseId}/units`), { name, createdAt: new Date() });
        unitNameInput.value = '';
    }
};

document.getElementById('add-note-btn').onclick = async () => {
    const text = noteTextInput.value.trim();
    const category = noteCategoryInput.value.trim();
    if (text && selectedUnitId) {
        await addDoc(collection(db, `courses/${selectedCourseId}/units/${selectedUnitId}/notes`), {
            noteText: text,
            category: category,
            keyword: selectedKeyword,
            createdAt: new Date()
        });
        noteTextInput.value = '';
        noteCategoryInput.value = '';
        selectedKeyword = '';
        selectedKeywordDisplay.textContent = 'Henüz seçilmedi.';
    }
};

// --- Keyword Selection ---
noteTextInput.onmouseup = () => {
    const sel = window.getSelection().toString().trim();
    if (sel) {
        selectedKeyword = sel;
        selectedKeywordDisplay.textContent = sel;
    }
};

// --- AI Chat ---
const openAiChatModal = (noteText) => {
    currentAiChatNote = noteText;
    document.getElementById('ai-chat-history').innerHTML = `<div class="system-message">Not: "<strong>${noteText}</strong>"</div>`;
    document.getElementById('ai-chat-modal').style.display = 'block';
};

document.getElementById('ai-send-btn').onclick = async () => {
    const input = document.getElementById('ai-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    const history = document.getElementById('ai-chat-history');
    history.innerHTML += `<div class="chat-message user-message">${msg}</div>`;
    input.value = '';

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Not: "${currentAiChatNote}". Soru: "${msg}". Bu notla ilgili kısa ve öz bilgi ver.`;
        const result = await model.generateContent(prompt);
        history.innerHTML += `<div class="chat-message ai-message">${result.response.text()}</div>`;
        history.scrollTop = history.scrollHeight;
    } catch (e) {
        console.error(e);
    }
};

// --- Modals & Initialization ---
const openEditModal = (type, id, data) => {
    currentEdit = { type, id, originalData: data };
    document.getElementById('modal-textarea').value = data.noteText || data.name;
    document.getElementById('edit-modal').style.display = 'block';
};

document.querySelector('.close-btn').onclick = () => document.getElementById('edit-modal').style.display = 'none';
document.getElementById('back-to-courses-btn').onclick = showCourses;
document.getElementById('back-to-units-btn').onclick = () => showUnits(selectedCourseId, selectedCourseTitle.textContent);

// Tema & Başlangıç
document.getElementById('theme-toggle').onchange = (e) => {
    document.documentElement.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
};

displayCourses();
