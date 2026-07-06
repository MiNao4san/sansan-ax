"use strict";

const STORAGE_KEY = "lesson-archive-prototype-v1";
const GOOGLE_CONFIG = {
  apiKey: "ここにAPIキー",
  clientId: "ここにOAuthクライアントID",
  recordingsFolderId: "ここにDrive録画フォルダID"
};

const DRIVE_DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
const DRIVE_SCOPES = "https://www.googleapis.com/auth/drive.metadata.readonly";

let googleApiInitialized = false;
let tokenClient = null;
let currentAccessToken = "";

const courseMasters = [
  {
    id: "course-uiux",
    title: "UI/UXデザイン",
    grade: "2年",
    subject: "デザイン",
    teacher: "佐藤 美咲",
    textbook: "UXデザインの教科書",
    credits: "2",
    units: ["UIとは何か", "UXリサーチ", "ペルソナ設計", "ワイヤーフレーム"]
  },
  {
    id: "course-web",
    title: "Webプログラミング",
    grade: "1年",
    subject: "情報",
    teacher: "田中 健",
    textbook: "HTML/CSS/JavaScript入門",
    credits: "2",
    units: ["HTMLの構造", "CSSレイアウト", "JavaScript基礎", "DOM操作"]
  },
  {
    id: "course-data",
    title: "データサイエンス基礎",
    grade: "3年",
    subject: "情報",
    teacher: "山本 葵",
    textbook: "はじめてのデータ分析",
    credits: "2",
    units: ["データの見方", "表計算で集計", "可視化", "相関と回帰"]
  },
  {
    id: "course-business",
    title: "ビジネス基礎",
    grade: "1年",
    subject: "商業",
    teacher: "鈴木 亮",
    textbook: "ビジネス基礎",
    credits: "1",
    units: ["会社のしくみ", "マーケティング", "会計の入口"]
  }
];

const driveFiles = [
  makeDriveFile("drv-uiux-001", "UI/UXデザイン - 2026/04/09 13:33 JST〜 Recording", "2026-04-09T04:33:00.000Z"),
  makeDriveFile("drv-uiux-002", "UI/UXデザイン - 2026/04/16 13:30 JST〜 Recording", "2026-04-16T04:30:00.000Z"),
  makeDriveFile("drv-uiux-003", "UI/UXデザイン - 2026/04/23 13:31 JST〜 Recording", "2026-04-23T04:31:00.000Z"),
  makeDriveFile("drv-web-001", "Webプログラミング - 2026/04/10 09:10 JST〜 Recording", "2026-04-10T00:10:00.000Z"),
  makeDriveFile("drv-web-002", "Webプログラミング - 2026/04/17 09:08 JST〜 Recording", "2026-04-17T00:08:00.000Z"),
  makeDriveFile("drv-data-001", "データサイエンス基礎 - 2026/04/11 10:50 JST〜 Recording", "2026-04-11T01:50:00.000Z"),
  makeDriveFile("drv-business-001", "ビジネス基礎 - 2026/04/13 15:00 JST〜 Recording", "2026-04-13T06:00:00.000Z")
];

const classroomMaterials = [
  makeMaterialSeed("mat-uiux-1", "UI/UXデザイン 第1回 スライド", "UI/UXデザイン", "2026-04-09", "https://classroom.google.com/c/uiux-1"),
  makeMaterialSeed("mat-uiux-2", "UXリサーチ ワークシート", "UI/UXデザイン", "2026-04-16", "https://classroom.google.com/c/uiux-2"),
  makeMaterialSeed("mat-uiux-3", "ペルソナ設計 テンプレート", "UI/UXデザイン", "2026-04-23", "https://classroom.google.com/c/uiux-3"),
  makeMaterialSeed("mat-web-1", "HTMLタグ一覧", "Webプログラミング", "2026-04-10", "https://classroom.google.com/c/web-1"),
  makeMaterialSeed("mat-web-2", "CSSレイアウト課題", "Webプログラミング", "2026-04-17", "https://classroom.google.com/c/web-2"),
  makeMaterialSeed("mat-data-1", "データ分析サンプルCSV", "データサイエンス基礎", "2026-04-11", "https://classroom.google.com/c/data-1"),
  makeMaterialSeed("mat-free", "全クラス共通 ガイダンス資料", "共通", "2026-04-08", "https://classroom.google.com/c/common")
];

const calendarEvents = [
  makeCalendarEvent("cal-uiux-1", "UI/UXデザイン", "2026-04-09T13:30:00+09:00", "2026-04-09T15:00:00+09:00"),
  makeCalendarEvent("cal-web-1", "Webプログラミング", "2026-04-10T09:00:00+09:00", "2026-04-10T10:30:00+09:00"),
  makeCalendarEvent("cal-data-1", "データサイエンス基礎", "2026-04-11T10:40:00+09:00", "2026-04-11T12:10:00+09:00")
];

const app = document.querySelector("#app");
const syncButton = document.querySelector("#syncButton");

let state = loadState();

syncButton.addEventListener("click", handleDriveSync);

async function handleDriveSync() {
  const originalText = syncButton.textContent;

  try {
    syncButton.disabled = true;
    syncButton.textContent = "Drive接続中...";

    await ensureGoogleAccessToken();

    syncButton.textContent = "取り込み中...";

    const realDriveFiles = await fetchDriveRecordingFiles(GOOGLE_CONFIG.recordingsFolderId);

    state.lessons = importLessonsFromDrive(realDriveFiles, courseMasters, classroomMaterials);
    persist();
    render();

    alert(`${realDriveFiles.length}件の録画を取り込みました。`);
  } catch (error) {
    console.error(error);
    alert(`Drive取り込みに失敗しました。\n${error.message || error}`);
  } finally {
    syncButton.disabled = false;
    syncButton.textContent = originalText;
  }
}

window.addEventListener("hashchange", render);

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) {
    return;
  }

  if (action.dataset.action === "reset-demo") {
    localStorage.removeItem(STORAGE_KEY);
    state = createInitialState();
    persist();
    render();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("#lessonEditForm")) {
    event.preventDefault();
    saveLessonEdit(new FormData(event.target));
  }
});

if (!location.hash) {
  location.hash = "#/lessons";
} else {
  render();
}

function makeDriveFile(id, name, createdTime) {
  return {
    id,
    name,
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
    embedUrl: `https://drive.google.com/file/d/${id}/preview`,
    createdTime,
    modifiedTime: createdTime,
    mimeType: "video/mp4"
  };
}

function makeMaterialSeed(id, title, courseTitle, createdDate, url) {
  return {
    id,
    title,
    courseTitle,
    createdDate,
    url,
    source: "classroom"
  };
}

function makeCalendarEvent(id, title, start, end) {
  return { id, title, start, end, calendarId: "school-calendar" };
}

function createInitialState() {
  return {
    lessons: importLessonsFromDrive(driveFiles, courseMasters, classroomMaterials),
    importedAt: new Date().toISOString()
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.lessons?.length) {
      return stored;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createInitialState();
}

function persist() {
  state.importedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function importLessonsFromDrive(files, masters, materials) {
  const recordings = files
    .filter((file) => file.name.includes("Recording") && file.mimeType.startsWith("video/"))
    .map((file) => {
      const parsed = parseRecordingName(file.name);
      const master = findCourseMaster(parsed.title, masters);
      return {
        id: file.id,
        title: parsed.title || file.name.replace(" Recording", ""),
        grade: master?.grade || "未設定",
        subject: master?.subject || "未分類",
        lessonDate: parsed.date?.toISOString() || file.createdTime,
        lessonNumber: 0,
        teacher: master?.teacher || "未設定",
        unit: "",
        textbook: master?.textbook || "",
        credits: master?.credits || "",
        driveFileId: file.id,
        driveUrl: file.webViewLink,
        embedUrl: file.embedUrl,
        mimeType: file.mimeType,
        calendarEventId: matchCalendarEvent(parsed.title, parsed.date)?.id || "",
        createdAt: file.createdTime,
        updatedAt: file.modifiedTime,
        materials: []
      };
    })
    .sort((a, b) => new Date(a.lessonDate) - new Date(b.lessonDate));

  assignLessonNumbersAndUnits(recordings, masters);
  linkClassroomMaterials(recordings, materials);
  return recordings;
}
async function ensureGoogleAccessToken() {
  validateGoogleConfig();

  if (!googleApiInitialized) {
    await initializeGoogleApiClient();
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      currentAccessToken = response.access_token;
      resolve(response.access_token);
    };

    tokenClient.requestAccessToken({
      prompt: currentAccessToken ? "" : "consent"
    });
  });
}

function validateGoogleConfig() {
  if (
    !GOOGLE_CONFIG.apiKey ||
    !GOOGLE_CONFIG.clientId ||
    !GOOGLE_CONFIG.recordingsFolderId ||
    GOOGLE_CONFIG.apiKey.includes("ここに") ||
    GOOGLE_CONFIG.clientId.includes("ここに") ||
    GOOGLE_CONFIG.recordingsFolderId.includes("ここに")
  ) {
    throw new Error("GOOGLE_CONFIG の apiKey / clientId / recordingsFolderId を設定してください。");
  }
}

async function initializeGoogleApiClient() {
  await waitForGoogleLibraries();

  await new Promise((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({
          apiKey: GOOGLE_CONFIG.apiKey,
          discoveryDocs: [DRIVE_DISCOVERY_DOC]
        });

        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CONFIG.clientId,
          scope: DRIVE_SCOPES,
          callback: ""
        });

        googleApiInitialized = true;
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function waitForGoogleLibraries() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const timer = setInterval(() => {
      const gapiReady = Boolean(window.gapi);
      const gisReady = Boolean(window.google?.accounts?.oauth2);

      if (gapiReady && gisReady) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > 10000) {
        clearInterval(timer);
        reject(new Error("Google APIライブラリの読み込みに失敗しました。"));
      }
    }, 100);
  });
}

async function fetchDriveRecordingFiles(folderId) {
  const query = [
    `'${folderId}' in parents`,
    "trashed = false",
    "name contains 'Recording'"
  ].join(" and ");

  const files = [];
  let pageToken = null;

  do {
    const response = await gapi.client.drive.files.list({
      q: query,
      pageSize: 100,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });

    files.push(...(response.result.files || []));
    pageToken = response.result.nextPageToken;
  } while (pageToken);

  return files
    .filter((file) => file.mimeType?.startsWith("video/"))
    .map((file) => ({
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
      embedUrl: `https://drive.google.com/file/d/${file.id}/preview`,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      mimeType: file.mimeType
    }));
}

function parseRecordingName(fileName) {
  const match = fileName.match(
    /^(.+?)\s-\s(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})\s*JST[〜~ー-]?\s*Recording$/i
  );

  if (!match) {
    return { title: "", date: null };
  }

  const [, title, year, month, day, hour, minute] = match;

  const paddedMonth = month.padStart(2, "0");
  const paddedDay = day.padStart(2, "0");
  const paddedHour = hour.padStart(2, "0");

  const date = new Date(
    `${year}-${paddedMonth}-${paddedDay}T${paddedHour}:${minute}:00+09:00`
  );

  return {
    title: title.trim(),
    date
  };
}

function findCourseMaster(title, masters) {
  return masters.find((master) => master.title === title) || null;
}

function matchCalendarEvent(title, date) {
  if (!title || !date) {
    return null;
  }

  return calendarEvents.find((event) => {
    const startsAt = new Date(event.start);
    const diffMinutes = Math.abs(startsAt - date) / 60000;
    return event.title === title && diffMinutes <= 30;
  }) || null;
}

function assignLessonNumbersAndUnits(lessons, masters) {
  const grouped = lessons.reduce((result, lesson) => {
    result[lesson.title] = result[lesson.title] || [];
    result[lesson.title].push(lesson);
    return result;
  }, {});

  Object.entries(grouped).forEach(([title, items]) => {
    const master = findCourseMaster(title, masters);
    items
      .sort((a, b) => new Date(a.lessonDate) - new Date(b.lessonDate))
      .forEach((lesson, index) => {
        lesson.lessonNumber = index + 1;
        lesson.unit = master?.units[index] || "未設定";
      });
  });
}

function linkClassroomMaterials(lessons, materials) {
  lessons.forEach((lesson) => {
    const lessonDate = toDateInputValue(lesson.lessonDate);
    lesson.materials = materials
      .filter((material) => material.courseTitle === lesson.title && material.createdDate === lessonDate)
      .map((material) => ({
        id: `${lesson.id}-${material.id}`,
        title: material.title,
        url: material.url,
        source: material.source,
        classroomMaterialId: material.id,
        driveFileId: "",
        matchedBy: "授業名 + 授業日"
      }));
  });
}

function render() {
  const route = parseRoute();
  if (route.view === "detail") {
    renderDetail(route.id);
  } else if (route.view === "edit") {
    renderEdit(route.id);
  } else {
    renderLessons();
  }
  app.focus({ preventScroll: true });
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "lessons" && parts[1] && parts[2] === "edit") {
    return { view: "edit", id: parts[1] };
  }
  if (parts[0] === "lessons" && parts[1]) {
    return { view: "detail", id: parts[1] };
  }
  return { view: "list" };
}

function renderLessons() {
  const filters = getFilters();
  const filteredLessons = applyFilters(state.lessons, filters);
  const stats = getStats(state.lessons);

  app.innerHTML = `
    <section class="overview-band">
      <div>
        <p class="eyebrow">Google Drive / Classroom</p>
        <h1>授業動画を、教科・学年・単元からすぐ見つける。</h1>
        <p class="lead">録画ファイル名を解析し、シラバスマスタとClassroom資料を照合する初期プロトタイプです。</p>
      </div>
      <div class="sync-panel" aria-label="取り込み状況">
        <span>最終取り込み</span>
        <strong>${formatDateTime(state.importedAt)}</strong>
        <button class="text-button" type="button" data-action="reset-demo">サンプルを初期化</button>
      </div>
    </section>

    <section class="metrics-grid" aria-label="集計">
      ${metric("録画", `${stats.total}件`)}
      ${metric("資料あり", `${stats.withMaterials}件`)}
      ${metric("教科", `${stats.subjects}件`)}
      ${metric("教師", `${stats.teachers}名`)}
    </section>

    <section class="content-grid">
      <aside class="filter-panel" aria-label="絞り込み">
        <div class="section-heading">
          <h2>絞り込み</h2>
          <a href="#/lessons">クリア</a>
        </div>
        ${selectFilter("subject", "教科", filters.subject, uniqueValues(state.lessons, "subject"))}
        ${selectFilter("grade", "学年", filters.grade, uniqueValues(state.lessons, "grade"))}
        ${selectFilter("lessonDate", "授業日", filters.lessonDate, uniqueDateValues(state.lessons))}
        ${selectFilter("lessonNumber", "授業回", filters.lessonNumber, uniqueValues(state.lessons, "lessonNumber").map(String))}
        ${selectFilter("teacher", "担当教師", filters.teacher, uniqueValues(state.lessons, "teacher"))}
        ${selectFilter("unit", "単元", filters.unit, uniqueValues(state.lessons, "unit"))}
      </aside>

      <section class="lesson-area" aria-label="授業一覧">
        <div class="section-heading">
          <h2>授業一覧</h2>
          <span>${filteredLessons.length}件表示</span>
        </div>
        <div class="lesson-grid">
          ${filteredLessons.map(lessonCard).join("") || emptyState("条件に合う授業がありません。")}
        </div>
      </section>
    </section>
  `;

  app.querySelectorAll("[data-filter]").forEach((control) => {
    control.addEventListener("change", () => updateFilter(control.dataset.filter, control.value));
  });
}

function renderDetail(id) {
  const lesson = findLesson(id);
  if (!lesson) {
    renderNotFound();
    return;
  }

  app.innerHTML = `
    <section class="detail-layout">
      <div class="video-column">
        <a class="back-link" href="#/lessons">← 授業一覧へ</a>
        <div class="video-frame">
          <iframe title="${escapeHtml(lesson.title)}の録画" src="${lesson.embedUrl}" allow="autoplay; encrypted-media" allowfullscreen></iframe>
        </div>
        <div class="detail-title-row">
          <div>
            <p class="eyebrow">${lesson.subject} / ${lesson.grade}</p>
            <h1>${escapeHtml(lesson.title)}</h1>
            <p>${formatLessonDate(lesson.lessonDate)} ・ 第${lesson.lessonNumber}回 ・ ${escapeHtml(lesson.unit)}</p>
          </div>
          <a class="primary-button" href="#/lessons/${lesson.id}/edit">タグ編集</a>
        </div>
        <section class="materials-section">
          <div class="section-heading">
            <h2>授業資料</h2>
            <span>${lesson.materials.length}件</span>
          </div>
          <div class="material-list">
            ${lesson.materials.map(materialCard).join("") || emptyState("紐付いた資料はまだありません。編集画面から手動追加できます。")}
          </div>
        </section>
      </div>

      <aside class="detail-sidebar">
        <h2>タグ情報</h2>
        <dl class="tag-list">
          ${definition("授業名", lesson.title)}
          ${definition("教科", lesson.subject)}
          ${definition("学年", lesson.grade)}
          ${definition("授業日", formatLessonDate(lesson.lessonDate))}
          ${definition("授業回", `第${lesson.lessonNumber}回`)}
          ${definition("担当教師", lesson.teacher)}
          ${definition("単元", lesson.unit)}
          ${definition("DriveファイルID", lesson.driveFileId)}
        </dl>
        <a class="secondary-button full-width" href="${lesson.driveUrl}" target="_blank" rel="noreferrer">Driveで開く</a>
      </aside>
    </section>
  `;
}

function renderEdit(id) {
  const lesson = findLesson(id);
  if (!lesson) {
    renderNotFound();
    return;
  }

  app.innerHTML = `
    <section class="edit-page">
      <a class="back-link" href="#/lessons/${lesson.id}">← 詳細へ戻る</a>
      <div class="section-heading edit-heading">
        <div>
          <p class="eyebrow">Tag Editor</p>
          <h1>タグ編集</h1>
        </div>
        <a class="ghost-button" href="#/lessons/${lesson.id}">キャンセル</a>
      </div>

      <form id="lessonEditForm" class="edit-form">
        <input type="hidden" name="id" value="${lesson.id}" />
        <div class="form-grid">
          ${inputField("title", "授業名", lesson.title)}
          ${inputField("subject", "教科", lesson.subject)}
          ${inputField("grade", "学年", lesson.grade)}
          ${inputField("lessonDate", "授業日時", toDateTimeLocalValue(lesson.lessonDate), "datetime-local")}
          ${inputField("lessonNumber", "授業回", lesson.lessonNumber, "number")}
          ${inputField("teacher", "担当教師", lesson.teacher)}
          ${inputField("unit", "単元", lesson.unit)}
          ${inputField("driveUrl", "Drive動画URL", lesson.driveUrl, "url")}
        </div>

        <section class="material-editor">
          <div class="section-heading">
            <h2>資料リンク</h2>
            <button class="secondary-button" type="button" id="addMaterialButton">資料を追加</button>
          </div>
          <div id="materialRows" class="material-editor-list">
            ${lesson.materials.map(materialEditorRow).join("")}
          </div>
        </section>

        <div class="form-actions">
          <button class="primary-button" type="submit">保存する</button>
          <a class="secondary-button" href="#/lessons/${lesson.id}">詳細へ戻る</a>
        </div>
      </form>
    </section>
  `;

  const addButton = app.querySelector("#addMaterialButton");
  const rows = app.querySelector("#materialRows");
  addButton.addEventListener("click", () => rows.insertAdjacentHTML("beforeend", materialEditorRow()));
  rows.addEventListener("click", (event) => {
    if (event.target.matches("[data-remove-material]")) {
      event.target.closest(".material-editor-row").remove();
    }
  });
}

function renderNotFound() {
  app.innerHTML = `
    <section class="not-found">
      <h1>授業が見つかりません</h1>
      <a class="primary-button" href="#/lessons">授業一覧へ戻る</a>
    </section>
  `;
}

function getFilters() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  return {
    subject: params.get("subject") || "",
    grade: params.get("grade") || "",
    lessonDate: params.get("lessonDate") || "",
    lessonNumber: params.get("lessonNumber") || "",
    teacher: params.get("teacher") || "",
    unit: params.get("unit") || ""
  };
}

function updateFilter(key, value) {
  const filters = getFilters();
  filters[key] = value;
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([filterKey, filterValue]) => {
    if (filterValue) {
      params.set(filterKey, filterValue);
    }
  });
  location.hash = `#/lessons${params.toString() ? `?${params}` : ""}`;
}

function applyFilters(lessons, filters) {
  return lessons.filter((lesson) => {
    return Object.entries(filters).every(([key, value]) => {
      if (!value) {
        return true;
      }
      if (key === "lessonDate") {
        return toDateInputValue(lesson.lessonDate) === value;
      }
      return String(lesson[key]) === value;
    });
  });
}

function saveLessonEdit(formData) {
  const id = formData.get("id");
  const lesson = findLesson(id);
  if (!lesson) {
    return;
  }

  lesson.title = formData.get("title").trim();
  lesson.subject = formData.get("subject").trim();
  lesson.grade = formData.get("grade").trim();
  lesson.lessonDate = new Date(formData.get("lessonDate")).toISOString();
  lesson.lessonNumber = Number(formData.get("lessonNumber"));
  lesson.teacher = formData.get("teacher").trim();
  lesson.unit = formData.get("unit").trim();
  lesson.driveUrl = formData.get("driveUrl").trim();
  lesson.updatedAt = new Date().toISOString();

  const titles = formData.getAll("materialTitle");
  const urls = formData.getAll("materialUrl");
  const sources = formData.getAll("materialSource");
  lesson.materials = titles
    .map((title, index) => ({
      id: `${lesson.id}-manual-${index}-${Date.now()}`,
      title: title.trim(),
      url: urls[index].trim(),
      source: sources[index],
      classroomMaterialId: sources[index] === "classroom" ? "manual-link" : "",
      driveFileId: "",
      matchedBy: sources[index] === "classroom" ? "手動確認" : "手動追加"
    }))
    .filter((material) => material.title && material.url);

  persist();
  location.hash = `#/lessons/${lesson.id}`;
}

function lessonCard(lesson) {
  return `
    <article class="lesson-card">
      <div class="thumbnail">
        <span>${escapeHtml(lesson.subject)}</span>
        <strong>第${lesson.lessonNumber}回</strong>
      </div>
      <div class="lesson-card-body">
        <div class="card-tags">
          <span>${escapeHtml(lesson.grade)}</span>
          <span>${escapeHtml(lesson.unit)}</span>
        </div>
        <h3>${escapeHtml(lesson.title)}</h3>
        <p>${formatLessonDate(lesson.lessonDate)}</p>
        <dl>
          ${definition("担当", lesson.teacher)}
          ${definition("資料", lesson.materials.length ? "あり" : "なし")}
        </dl>
        <div class="card-actions">
          <a class="primary-button" href="#/lessons/${lesson.id}">詳細</a>
          <a class="ghost-button" href="#/lessons/${lesson.id}/edit">編集</a>
        </div>
      </div>
    </article>
  `;
}

function materialCard(material) {
  return `
    <article class="material-card">
      <div>
        <h3>${escapeHtml(material.title)}</h3>
        <p>${material.source === "classroom" ? "Google Classroom" : "手動リンク"} ・ ${escapeHtml(material.matchedBy || "手動")}</p>
      </div>
      <a class="secondary-button" href="${material.url}" target="_blank" rel="noreferrer">開く</a>
    </article>
  `;
}

function materialEditorRow(material = {}) {
  return `
    <div class="material-editor-row">
      <input name="materialTitle" type="text" value="${escapeAttribute(material.title || "")}" placeholder="資料タイトル" />
      <input name="materialUrl" type="url" value="${escapeAttribute(material.url || "")}" placeholder="https://..." />
      <select name="materialSource">
        <option value="classroom" ${material.source === "classroom" ? "selected" : ""}>Classroom</option>
        <option value="manual" ${material.source === "manual" ? "selected" : ""}>手動</option>
      </select>
      <button class="icon-button" type="button" data-remove-material aria-label="資料を削除">×</button>
    </div>
  `;
}

function selectFilter(name, label, current, values) {
  return `
    <label class="filter-control">
      <span>${label}</span>
      <select data-filter="${name}">
        <option value="">すべて</option>
        ${values.map((value) => `<option value="${escapeAttribute(value)}" ${String(current) === String(value) ? "selected" : ""}>${escapeHtml(displayFilterValue(name, value))}</option>`).join("")}
      </select>
    </label>
  `;
}

function displayFilterValue(name, value) {
  if (name === "lessonNumber") {
    return `第${value}回`;
  }
  if (name === "lessonDate") {
    return formatDateOnly(value);
  }
  return value;
}

function inputField(name, label, value, type = "text") {
  return `
    <label class="field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${escapeAttribute(value)}" required />
    </label>
  `;
}

function metric(label, value) {
  return `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function definition(term, description) {
  return `<dt>${term}</dt><dd>${escapeHtml(String(description || "未設定"))}</dd>`;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function getStats(lessons) {
  return {
    total: lessons.length,
    withMaterials: lessons.filter((lesson) => lesson.materials.length > 0).length,
    subjects: uniqueValues(lessons, "subject").length,
    teachers: uniqueValues(lessons, "teacher").length
  };
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "ja"));
}

function uniqueDateValues(items) {
  return [...new Set(items.map((item) => toDateInputValue(item.lessonDate)))]
    .sort((a, b) => new Date(a) - new Date(b));
}

function findLesson(id) {
  return state.lessons.find((lesson) => lesson.id === id);
}

function formatLessonDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo"
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo"
  }).format(new Date(value));
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeZone: "Asia/Tokyo"
  }).format(new Date(`${value}T00:00:00+09:00`));
}

function toDateInputValue(value) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toDateTimeLocalValue(value) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
