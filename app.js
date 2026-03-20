// ============================================================
// app.js — StudySentry Core Application Logic
// ============================================================

"use strict";

// ─────────────────────────────────────────────────────────────
// 0. CONSTANTS & STATE
// ─────────────────────────────────────────────────────────────
const AVATARS = [
  // SVG data URLs for 6 built-in minimalist avatars
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%23312e81'/><circle cx='40' cy='30' r='14' fill='%23a5b4fc'/><ellipse cx='40' cy='70' rx='22' ry='18' fill='%23a5b4fc'/></svg>`,
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%23064e3b'/><circle cx='40' cy='30' r='14' fill='%236ee7b7'/><ellipse cx='40' cy='70' rx='22' ry='18' fill='%236ee7b7'/></svg>`,
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%237c2d12'/><circle cx='40' cy='30' r='14' fill='%23fdba74'/><ellipse cx='40' cy='70' rx='22' ry='18' fill='%23fdba74'/></svg>`,
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%234a044e'/><circle cx='40' cy='30' r='14' fill='%23e879f9'/><ellipse cx='40' cy='70' rx='22' ry='18' fill='%23e879f9'/></svg>`,
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%230c4a6e'/><circle cx='40' cy='30' r='14' fill='%2338bdf8'/><ellipse cx='40' cy='70' rx='22' ry='18' fill='%2338bdf8'/></svg>`,
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%23713f12'/><circle cx='40' cy='30' r='14' fill='%23fde68a'/><ellipse cx='40' cy='70' rx='22' ry='18' fill='%23fde68a'/></svg>`
];

const STATE = {
  user: null,
  profile: null,
  currentPage: "home",
  timer: {
    running: false,
    seconds: 0,
    interval: null,
    subject: "",
    topic: "",
    startTime: null
  },
  onboardingStep: 1,
  selectedAvatar: 0,
  chatHistory: []
};

// ─────────────────────────────────────────────────────────────
// 1. AUTH FLOW
// ─────────────────────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  if (user) {
    STATE.user = user;
    await checkApprovalAndRoute(user);
  } else {
    STATE.user = null;
    showScreen("auth-screen");
  }
});

async function checkApprovalAndRoute(user) {
  try {
    const doc = await db.collection("users").doc(user.uid).get();
    if (!doc.exists) {
      // New user: create record
      await db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email: user.email || "",
        phone: user.phoneNumber || "",
        is_approved: false,
        onboarding_done: false,
        xp: 0,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      showScreen("pending-screen");
      return;
    }
    const data = doc.data();
    if (!data.is_approved) {
      showScreen("pending-screen");
      return;
    }
    STATE.profile = data;
    if (!data.onboarding_done) {
      showScreen("onboarding-screen");
      renderOnboardingStep(1);
    } else {
      enterApp();
    }
  } catch (e) {
    console.error(e);
    showScreen("auth-screen");
  }
}

// ─────────────────────────────────────────────────────────────
// 2. AUTH UI — Email + Phone OTP
// ─────────────────────────────────────────────────────────────
let confirmationResult = null;
let recaptchaVerifier   = null;

function setupRecaptcha() {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
      size: "invisible",
      callback: () => {}
    });
  }
}

// Tab switching
document.querySelectorAll(".auth-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(b => b.classList.remove("active-tab"));
    btn.classList.add("active-tab");
    const tab = btn.dataset.tab;
    document.getElementById("email-form").classList.toggle("hidden", tab !== "email");
    document.getElementById("phone-form").classList.toggle("hidden", tab !== "phone");
  });
});

// Email login/signup
document.getElementById("email-auth-btn").addEventListener("click", async () => {
  const email = document.getElementById("email-input").value.trim();
  const pass  = document.getElementById("pass-input").value.trim();
  if (!email || !pass) return showToast("ইমেইল ও পাসওয়ার্ড দিন");
  try {
    showLoader(true);
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
      await auth.createUserWithEmailAndPassword(email, pass);
    }
  } catch(e) {
    showToast("❌ " + e.message);
  } finally {
    showLoader(false);
  }
});

// Phone — send OTP
document.getElementById("send-otp-btn").addEventListener("click", async () => {
  const phone = document.getElementById("phone-input").value.trim();
  if (!phone) return showToast("ফোন নম্বর দিন");
  setupRecaptcha();
  try {
    showLoader(true);
    confirmationResult = await auth.signInWithPhoneNumber(phone, recaptchaVerifier);
    document.getElementById("otp-section").classList.remove("hidden");
    showToast("✅ OTP পাঠানো হয়েছে");
  } catch (e) { showToast("❌ " + e.message); }
  finally { showLoader(false); }
});

// Phone — verify OTP
document.getElementById("verify-otp-btn").addEventListener("click", async () => {
  const otp = document.getElementById("otp-input").value.trim();
  if (!otp) return showToast("OTP দিন");
  try {
    showLoader(true);
    await confirmationResult.confirm(otp);
  } catch (e) { showToast("❌ OTP ভুল হয়েছে"); }
  finally { showLoader(false); }
});

// ─────────────────────────────────────────────────────────────
// 3. ONBOARDING
// ─────────────────────────────────────────────────────────────
function renderOnboardingStep(step) {
  STATE.onboardingStep = step;
  document.querySelectorAll(".ob-step").forEach((el, i) => {
    el.classList.toggle("hidden", i + 1 !== step);
  });
  // Update dots
  document.querySelectorAll(".ob-dot").forEach((dot, i) => {
    dot.classList.toggle("bg-indigo-400", i + 1 === step);
    dot.classList.toggle("bg-white/20", i + 1 !== step);
  });

  if (step === 1) renderAvatars();
}

function renderAvatars() {
  const grid = document.getElementById("avatar-grid");
  grid.innerHTML = "";
  AVATARS.forEach((src, i) => {
    const div = document.createElement("div");
    div.className = `avatar-option cursor-pointer rounded-2xl p-1 border-2 transition-all duration-200 ${i === STATE.selectedAvatar ? "border-indigo-400 scale-110" : "border-white/10"}`;
    div.innerHTML = `<img src="${src}" class="w-16 h-16 rounded-xl" />`;
    div.addEventListener("click", () => {
      STATE.selectedAvatar = i;
      renderAvatars();
    });
    grid.appendChild(div);
  });
}

document.getElementById("ob-next-1").addEventListener("click", () => {
  const name = document.getElementById("ob-name").value.trim();
  if (!name) return showToast("নাম দিন");
  renderOnboardingStep(2);
});

document.getElementById("ob-next-2").addEventListener("click", () => {
  const age     = document.getElementById("ob-age").value.trim();
  const cls     = document.getElementById("ob-class").value.trim();
  const college = document.getElementById("ob-college").value.trim();
  if (!age || !cls || !college) return showToast("সব তথ্য পূরণ করুন");
  renderOnboardingStep(3);
});

document.getElementById("ob-goal-slider").addEventListener("input", e => {
  document.getElementById("ob-goal-display").textContent = e.target.value + " ঘণ্টা";
});

document.getElementById("ob-finish-btn").addEventListener("click", async () => {
  const name     = document.getElementById("ob-name").value.trim();
  const age      = document.getElementById("ob-age").value.trim();
  const cls      = document.getElementById("ob-class").value.trim();
  const college  = document.getElementById("ob-college").value.trim();
  const goal     = parseInt(document.getElementById("ob-goal-slider").value);
  const avatarUrl = AVATARS[STATE.selectedAvatar];

  try {
    showLoader(true);
    await db.collection("users").doc(STATE.user.uid).update({
      name, age, class: cls, college, daily_goal_hours: goal,
      avatar: avatarUrl,
      onboarding_done: true
    });
    STATE.profile = { ...STATE.profile, name, age, class: cls, college, daily_goal_hours: goal, avatar: avatarUrl, onboarding_done: true };
  } catch(e) { showToast("❌ সংরক্ষণ ব্যর্থ"); return; }
  finally { showLoader(false); }

  // Transition animation
  showScreen("generating-screen");
  setTimeout(() => enterApp(), 3000);
});

// ─────────────────────────────────────────────────────────────
// 4. MAIN APP
// ─────────────────────────────────────────────────────────────
function enterApp() {
  showScreen("app-shell");
  navigateTo("home");
  populateProfile();
}

function navigateTo(page) {
  STATE.currentPage = page;
  document.querySelectorAll(".page").forEach(p => {
    p.classList.toggle("hidden", p.id !== `page-${page}`);
  });
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("nav-active", b.dataset.page === page);
  });

  if (page === "home")        loadHomePage();
  if (page === "leaderboard") loadLeaderboard();
  if (page === "profile")     loadProfilePage();
  if (page === "tracker")     initTracker();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});

// Settings icon
document.getElementById("settings-btn").addEventListener("click", () => {
  document.getElementById("settings-modal").classList.remove("hidden");
});
document.getElementById("close-settings").addEventListener("click", () => {
  document.getElementById("settings-modal").classList.add("hidden");
});
document.getElementById("logout-btn").addEventListener("click", async () => {
  await auth.signOut();
  document.getElementById("settings-modal").classList.add("hidden");
});

// ─────────────────────────────────────────────────────────────
// 5. HOME PAGE — Circular Progress
// ─────────────────────────────────────────────────────────────
async function loadHomePage() {
  const uid   = STATE.user.uid;
  const today = todayStr();
  let totalSeconds = 0;

  try {
    const snap = await db.collection("StudyLogs")
      .where("uid", "==", uid)
      .where("date", "==", today)
      .get();
    snap.forEach(doc => { totalSeconds += doc.data().duration_seconds || 0; });
  } catch(e) { console.error(e); }

  const goalSec  = (STATE.profile?.daily_goal_hours || 4) * 3600;
  const pct      = Math.min(100, Math.round((totalSeconds / goalSec) * 100));
  const hours    = Math.floor(totalSeconds / 3600);
  const minutes  = Math.floor((totalSeconds % 3600) / 60);

  // Update circular SVG
  const circle = document.getElementById("progress-circle");
  const circumference = 2 * Math.PI * 54;
  circle.style.strokeDasharray  = circumference;
  circle.style.strokeDashoffset = circumference - (pct / 100) * circumference;

  document.getElementById("progress-pct").textContent  = pct + "%";
  document.getElementById("progress-time").textContent = `${hours}ঘ ${minutes}মি`;
  document.getElementById("home-name").textContent     = STATE.profile?.name || "শিক্ষার্থী";
  document.getElementById("home-goal").textContent     = `লক্ষ্য: ${STATE.profile?.daily_goal_hours || 4} ঘণ্টা`;

  const avatar = document.getElementById("home-avatar");
  if (STATE.profile?.avatar) avatar.src = STATE.profile.avatar;

  // Load recent logs
  loadRecentLogs(uid, today);
}

async function loadRecentLogs(uid, today) {
  try {
    const snap = await db.collection("StudyLogs")
      .where("uid", "==", uid)
      .where("date", "==", today)
      .orderBy("created_at", "desc")
      .limit(5)
      .get();

    const container = document.getElementById("recent-logs");
    container.innerHTML = "";
    if (snap.empty) {
      container.innerHTML = `<p class="text-white/40 text-sm text-center py-4">আজ কোনো পড়াশোনা নেই।</p>`;
      return;
    }
    snap.forEach(doc => {
      const d   = doc.data();
      const min = Math.round((d.duration_seconds || 0) / 60);
      const el  = document.createElement("div");
      el.className = "glass-card-sm flex justify-between items-center px-4 py-3 rounded-xl mb-2";
      el.innerHTML = `
        <div>
          <p class="text-white font-semibold text-sm">${d.subject}</p>
          <p class="text-white/50 text-xs">${d.topic}</p>
        </div>
        <span class="text-indigo-300 text-sm font-bold">${min} মিনিট</span>`;
      container.appendChild(el);
    });
  } catch(e) { console.error(e); }
}

// ─────────────────────────────────────────────────────────────
// 6. STUDY TRACKER — Stopwatch
// ─────────────────────────────────────────────────────────────
function initTracker() {
  renderTimerDisplay();
}

function renderTimerDisplay() {
  const h = Math.floor(STATE.timer.seconds / 3600);
  const m = Math.floor((STATE.timer.seconds % 3600) / 60);
  const s = STATE.timer.seconds % 60;
  document.getElementById("timer-display").textContent =
    `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

document.getElementById("timer-start-btn").addEventListener("click", () => {
  const subject = document.getElementById("tracker-subject").value.trim();
  const topic   = document.getElementById("tracker-topic").value.trim();
  if (!subject || !topic) return showToast("বিষয় ও টপিক দিন");

  if (STATE.timer.running) {
    // Pause
    clearInterval(STATE.timer.interval);
    STATE.timer.running = false;
    document.getElementById("timer-start-btn").textContent = "▶ চালু";
    document.getElementById("timer-save-btn").classList.remove("hidden");
  } else {
    // Start
    STATE.timer.subject   = subject;
    STATE.timer.topic     = topic;
    STATE.timer.startTime = STATE.timer.startTime || new Date();
    STATE.timer.running   = true;
    STATE.timer.interval  = setInterval(() => {
      STATE.timer.seconds++;
      renderTimerDisplay();
    }, 1000);
    document.getElementById("timer-start-btn").textContent = "⏸ বিরতি";
    document.getElementById("timer-save-btn").classList.add("hidden");
  }
});

document.getElementById("timer-reset-btn").addEventListener("click", () => {
  clearInterval(STATE.timer.interval);
  STATE.timer = { running: false, seconds: 0, interval: null, subject: "", topic: "", startTime: null };
  renderTimerDisplay();
  document.getElementById("timer-start-btn").textContent = "▶ শুরু";
  document.getElementById("timer-save-btn").classList.add("hidden");
});

document.getElementById("timer-save-btn").addEventListener("click", async () => {
  if (STATE.timer.seconds < 10) return showToast("কমপক্ষে ১০ সেকেন্ড পড়ুন");
  const uid      = STATE.user.uid;
  const duration = STATE.timer.seconds;
  const xpEarned = Math.floor(duration / 36); // 100 XP per hour

  try {
    showLoader(true);
    const batch = db.batch();

    // Save log
    const logRef = db.collection("StudyLogs").doc();
    batch.set(logRef, {
      uid,
      subject: STATE.timer.subject,
      topic:   STATE.timer.topic,
      duration_seconds: duration,
      xp: xpEarned,
      date: todayStr(),
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update user XP
    const userRef = db.collection("users").doc(uid);
    batch.update(userRef, {
      xp: firebase.firestore.FieldValue.increment(xpEarned)
    });

    await batch.commit();
    STATE.profile.xp = (STATE.profile.xp || 0) + xpEarned;

    showToast(`✅ সংরক্ষিত! +${xpEarned} XP অর্জিত`);
    document.getElementById("timer-reset-btn").click();
  } catch(e) { showToast("❌ সংরক্ষণ ব্যর্থ: " + e.message); }
  finally { showLoader(false); }
});

// ─────────────────────────────────────────────────────────────
// 7. LEADERBOARD
// ─────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const container = document.getElementById("leaderboard-list");
  container.innerHTML = `<p class="text-white/40 text-center py-8">লোড হচ্ছে...</p>`;

  try {
    const snap = await db.collection("users")
      .where("is_approved", "==", true)
      .orderBy("xp", "desc")
      .limit(20)
      .get();

    container.innerHTML = "";
    let rank = 1;
    snap.forEach(doc => {
      const d   = doc.data();
      if (!d.onboarding_done) return;
      const isMe = doc.id === STATE.user.uid;
      const medals = ["🥇","🥈","🥉"];
      const el = document.createElement("div");
      el.className = `glass-card-sm flex items-center gap-4 px-4 py-3 rounded-2xl mb-3 ${isMe ? "border border-indigo-400/60" : ""}`;
      el.innerHTML = `
        <span class="text-2xl w-8 text-center">${medals[rank-1] || rank}</span>
        <img src="${d.avatar || AVATARS[0]}" class="w-10 h-10 rounded-xl" />
        <div class="flex-1">
          <p class="text-white font-semibold text-sm">${d.name || "অজানা"} ${isMe ? "<span class='text-indigo-300 text-xs'>(আপনি)</span>" : ""}</p>
          <p class="text-white/40 text-xs">${d.class || ""} · ${d.college || ""}</p>
        </div>
        <div class="text-right">
          <p class="text-indigo-300 font-bold">${(d.xp || 0).toLocaleString()}</p>
          <p class="text-white/30 text-xs">XP</p>
        </div>`;
      container.appendChild(el);
      rank++;
    });

    if (rank === 1) container.innerHTML = `<p class="text-white/40 text-center py-8">কোনো ডেটা নেই</p>`;
  } catch(e) {
    console.error(e);
    container.innerHTML = `<p class="text-red-400 text-center py-8">লোড ব্যর্থ</p>`;
  }
}

// ─────────────────────────────────────────────────────────────
// 8. AI ASSISTANT
// ─────────────────────────────────────────────────────────────
document.getElementById("ai-send-btn").addEventListener("click", sendAIMessage);
document.getElementById("ai-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
});

async function sendAIMessage() {
  const input = document.getElementById("ai-input");
  const text  = input.value.trim();
  if (!text) return;

  appendChatBubble(text, "user");
  input.value = "";
  STATE.chatHistory.push({ role: "user", parts: [{ text }] });

  const thinking = appendChatBubble("চিন্তা করছি...", "assistant", true);

  try {
    const GEMINI_KEY = "AIzaSyClKLmt8wpxGF-0DrDl34VeH7A1g85F8po";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: "তুমি StudySentry-এর AI Study Assistant। তুমি সবসময় বাংলায় সাড়া দাও। তুমি শুধু পড়াশোনা সম্পর্কিত প্রশ্নের উত্তর দাও। সংক্ষিপ্ত ও পরিষ্কার উত্তর দাও।" }]
          },
          contents: STATE.chatHistory
        })
      }
    );
    const data  = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "দুঃখিত, উত্তর দিতে পারছি না।";

    thinking.remove();
    appendChatBubble(reply, "assistant");
    STATE.chatHistory.push({ role: "model", parts: [{ text: reply }] });
    if (STATE.chatHistory.length > 20) STATE.chatHistory = STATE.chatHistory.slice(-20);
  } catch(e) {
    thinking.remove();
    appendChatBubble("❌ সংযোগ ব্যর্থ। আবার চেষ্টা করুন।", "assistant");
  }
}

function appendChatBubble(text, role, isTemp = false) {
  const container = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = `flex ${role === "user" ? "justify-end" : "justify-start"} mb-3`;
  div.innerHTML = `
    <div class="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed
      ${role === "user"
        ? "bg-indigo-600/80 text-white rounded-br-sm"
        : "glass-card-sm text-white/90 rounded-bl-sm"}">
      ${text.replace(/\n/g, "<br>")}
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

// ─────────────────────────────────────────────────────────────
// 9. PROFILE PAGE
// ─────────────────────────────────────────────────────────────
function loadProfilePage() {
  const p = STATE.profile;
  if (!p) return;
  document.getElementById("profile-name").textContent    = p.name || "—";
  document.getElementById("profile-class").textContent   = p.class || "—";
  document.getElementById("profile-college").textContent = p.college || "—";
  document.getElementById("profile-xp").textContent      = (p.xp || 0).toLocaleString() + " XP";
  document.getElementById("profile-goal").textContent    = (p.daily_goal_hours || 4) + " ঘণ্টা / দিন";
  const av = document.getElementById("profile-avatar");
  if (p.avatar) av.src = p.avatar;
}

function populateProfile() {
  const topBarAvatar = document.getElementById("topbar-avatar");
  if (STATE.profile?.avatar && topBarAvatar) topBarAvatar.src = STATE.profile.avatar;
}

// ─────────────────────────────────────────────────────────────
// 10. ADMIN PANEL (/admin-mehedi)
// ─────────────────────────────────────────────────────────────
async function loadAdminPanel() {
  const container = document.getElementById("admin-user-list");
  container.innerHTML = `<p class="text-white/50 text-center py-8">লোড হচ্ছে...</p>`;

  try {
    const snap = await db.collection("users").orderBy("created_at", "desc").get();
    container.innerHTML = "";
    snap.forEach(doc => {
      const d   = doc.data();
      const el  = document.createElement("div");
      el.className = "glass-card-sm flex items-center gap-4 px-4 py-4 rounded-2xl mb-3";
      el.innerHTML = `
        <img src="${d.avatar || AVATARS[0]}" class="w-12 h-12 rounded-xl" />
        <div class="flex-1 min-w-0">
          <p class="text-white font-semibold truncate">${d.name || "অনবোর্ডিং বাকি"}</p>
          <p class="text-white/40 text-xs truncate">${d.email || d.phone || d.uid}</p>
          <p class="text-white/30 text-xs">${d.college || ""}</p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <span class="px-2 py-1 rounded-full text-xs font-bold ${d.is_approved ? "bg-emerald-500/30 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}">
            ${d.is_approved ? "✅ অনুমোদিত" : "⏳ অপেক্ষারত"}
          </span>
          ${!d.is_approved ? `<button onclick="approveUser('${doc.id}', this)" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-xl transition-all">অনুমোদন দিন</button>` : `<button onclick="revokeUser('${doc.id}', this)" class="px-3 py-1 bg-red-700/60 hover:bg-red-600 text-white text-xs rounded-xl transition-all">বাতিল করুন</button>`}
        </div>`;
      container.appendChild(el);
    });
  } catch(e) {
    container.innerHTML = `<p class="text-red-400 text-center py-8">❌ লোড ব্যর্থ: ${e.message}</p>`;
  }
}

window.approveUser = async (uid, btn) => {
  btn.disabled = true;
  btn.textContent = "...";
  try {
    await db.collection("users").doc(uid).update({ is_approved: true });
    showToast("✅ অনুমোদন দেওয়া হয়েছে");
    loadAdminPanel();
  } catch(e) { showToast("❌ ব্যর্থ"); btn.disabled = false; btn.textContent = "অনুমোদন দিন"; }
};

window.revokeUser = async (uid, btn) => {
  if (!confirm("এই ব্যবহারকারীর অ্যাক্সেস বাতিল করবেন?")) return;
  btn.disabled = true;
  try {
    await db.collection("users").doc(uid).update({ is_approved: false });
    showToast("✅ অ্যাক্সেস বাতিল হয়েছে");
    loadAdminPanel();
  } catch(e) { showToast("❌ ব্যর্থ"); btn.disabled = false; }
};

// ─────────────────────────────────────────────────────────────
// 11. ROUTING
// ─────────────────────────────────────────────────────────────
function checkAdminRoute() {
  if (window.location.pathname.includes("admin-mehedi") ||
      window.location.hash === "#admin-mehedi") {
    document.querySelectorAll(".app-screen").forEach(s => s.classList.add("hidden"));
    document.getElementById("admin-screen").classList.remove("hidden");
    loadAdminPanel();
  }
}
window.addEventListener("hashchange", checkAdminRoute);
checkAdminRoute();

// ─────────────────────────────────────────────────────────────
// 12. UTILITIES
// ─────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".app-screen").forEach(s => s.classList.add("hidden"));
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function showLoader(show) {
  document.getElementById("global-loader").classList.toggle("hidden", !show);
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent  = msg;
  toast.classList.remove("opacity-0", "translate-y-4");
  toast.classList.add("opacity-100", "translate-y-0");
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-4");
    toast.classList.remove("opacity-100", "translate-y-0");
  }, 3000);
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────
// 13. SERVICE WORKER REGISTRATION (PWA)
// ─────────────────────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(reg => console.log("✅ SW registered:", reg.scope))
      .catch(err => console.error("SW registration failed:", err));
  });
}
