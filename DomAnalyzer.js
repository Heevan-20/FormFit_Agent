// domAnalyzer.js

// ================================
// MAIN ENTRY (CALLED FROM content.js)
// ================================
export async function analyzeAndConfirm() {
    const fileInputs = [...document.querySelectorAll("input[type='file']")];

    let inputs = [];

    // ================================
    // FALLBACK MODE
    // ================================
    if (fileInputs.length === 0) {
        console.log("No file inputs found → fallback mode");

        const fallback = createFallbackInput();
        inputs.push(fallback);

        await runPopupFlow(inputs);
        console.log("Returning fallback inputs:", inputs);
        return inputs;
    }

    // ================================
    // PARSE INPUTS
    // ================================
    inputs = await Promise.all(fileInputs.map(async (input, index) => {
        const domText = getRelevantText(input);
        const constraints = extractConstraints(domText);

        const parsed = {
            input,
            inputId: input.id || input.name || `formfit-file-${index}`,
            constraints,
            confidence: calculateConfidence(constraints),
            selectedFile: input.files?.[0] || null,
            fileSource: input.files?.[0] ? "form" : null,
            fileInfo: null,
            confirmed: false
        };

        await updateSelectedFileInfo(parsed);
        console.log(`Detected constraints for input ${parsed.inputId}:`, parsed.constraints);
        console.log(`Detected file for input ${parsed.inputId}:`, parsed.fileInfo);
        return parsed;
    }));

    console.log("Parsed Inputs:", inputs);

    // ================================
    // LISTEN FOR FILE SELECTION
    // ================================
    inputs.forEach((item) => {
        if (!item.input) return;

        item.input.addEventListener("change", async (e) => {
            const file = e.target.files?.[0] || null;
            const isProcessedFile = e.target.dataset.formfitFileState === "processed";

            item.selectedFile = file;
            item.fileSource = isProcessedFile ? "processed" : "form";
            await updateSelectedFileInfo(item);

            console.log("File captured from form:", item.fileInfo);

            updateOpenPopupFileStatus(item);
        });
    });

    // ================================
    // USER CONFIRMATION FLOW
    // ================================
    await runPopupFlow(inputs);

    console.log("Returning confirmed inputs:", inputs);
    return inputs;
}

// ================================
// POPUP FLOW (SEQUENTIAL)
// ================================
async function runPopupFlow(inputs) {
    for (let i = 0; i < inputs.length; i++) {
        await showPopup(inputs[i], i, inputs.length);
    }

    document.getElementById("formfit-popup")?.remove();
    console.log("All confirmed:", inputs);
}

// ================================
// POPUP UI (UPDATED)
// ================================
function showPopup(parsedInput, index, total) {
    return new Promise((resolve) => {
        document.getElementById("formfit-popup")?.remove();
        injectPopupStyles();

        const popup = document.createElement("div");
        popup.id = "formfit-popup";

        popup.innerHTML = `
            <div class="formfit-panel">

                <div class="formfit-header">
                    <span>FormFit Assistant</span>
                    <span class="formfit-step">${index + 1}/${total}</span>
                </div>

                <h3>Confirm Constraints</h3>

                <p class="status">${getPopupStatusText(parsedInput)}</p>
                <div class="formfit-file-info">${getFileInfoText(parsedInput)}</div>

                <label class="formfit-field">
                    <span>File</span>
                    <input class="formfit-file" type="file">
                </label>

                <label class="formfit-field">
                    <span>Input type</span>
                    <input class="formfit-type" value="${parsedInput.constraints.inputType}">
                </label>

                <label class="formfit-field">
                    <span>Valid formats</span>
                    <input class="formfit-formats" value="${parsedInput.constraints.validFormats.join(", ")}">
                </label>

                <label class="formfit-field">
                    <span>Max size</span>
                    <input class="formfit-size" value="${parsedInput.constraints.maxSize}">
                </label>

                <label class="formfit-field">
                    <span>Width</span>
                    <input class="formfit-width" value="${parsedInput.constraints.width}">
                </label>

                <label class="formfit-field">
                    <span>Height</span>
                    <input class="formfit-height" value="${parsedInput.constraints.height}">
                </label>

                <button class="formfit-save" ${parsedInput.selectedFile ? "" : "disabled"}>Confirm</button>
            </div>
        `;

        document.body.appendChild(popup);
        updatePopupFileInfo(popup, parsedInput);
        syncPopupFileInput(popup, parsedInput);

        // MAKE DRAGGABLE
        makePopupDraggable(popup);

        const popupFileInput = popup.querySelector(".formfit-file");
        popupFileInput.onchange = async (e) => {
            const file = e.target.files?.[0] || null;

            parsedInput.selectedFile = file;
            parsedInput.fileSource = file ? "popup" : null;
            await updateSelectedFileInfo(parsedInput);

            console.log("File captured from popup:", parsedInput.fileInfo);
            updatePopupFileInfo(popup, parsedInput);
        };

        // CONFIRM BUTTON
        popup.querySelector(".formfit-save").onclick = () => {
            parsedInput.constraints = readPopupConstraints(popup);
            parsedInput.confirmed = true;

            console.log(`Confirmed input ${parsedInput.inputId}:`, parsedInput);

            popup.remove();
            resolve();
        };
    });
}

// ================================
// DRAG FUNCTION
// ================================
function makePopupDraggable(popup) {
    const header = popup.querySelector(".formfit-header");
    if (!header) return;

    let offsetX = 0, offsetY = 0, isDown = false;

    header.style.cursor = "move";

    header.addEventListener("mousedown", (e) => {
        isDown = true;
        offsetX = e.clientX - popup.offsetLeft;
        offsetY = e.clientY - popup.offsetTop;
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        popup.style.left = (e.clientX - offsetX) + "px";
        popup.style.top = (e.clientY - offsetY) + "px";
        popup.style.right = "auto";
    });

    window.addEventListener("mouseup", () => {
        isDown = false;
    });
}

// ================================
// POPUP HELPERS
// ================================
function getPopupStatusText(p) {
    if (p.confidence === 0) return "No constraints detected";
    return `Detected ${p.confidence} constraints (verify/edit)`;
}

function readPopupConstraints(popup) {
    const constraints = {
        inputType: popup.querySelector(".formfit-type").value,
        validFormats: popup.querySelector(".formfit-formats").value
            .split(",")
            .map(x => x.trim().toUpperCase())
            .filter(Boolean),
        maxSize: popup.querySelector(".formfit-size").value,
        width: popup.querySelector(".formfit-width").value,
        height: popup.querySelector(".formfit-height").value
    };

    console.log("Read popup constraints:", constraints);
    return constraints;
}

// UPDATE popup when file is selected from form
function updateOpenPopupFileStatus(parsedInput) {
    const popup = document.getElementById("formfit-popup");
    if (!popup) return;

    const status = popup.querySelector(".status");
    if (status) status.textContent = getPopupStatusText(parsedInput);

    updatePopupFileInfo(popup, parsedInput);
}

function updatePopupFileInfo(popup, parsedInput) {
    const info = popup.querySelector(".formfit-file-info");
    if (info) info.textContent = getFileInfoText(parsedInput);

    const saveButton = popup.querySelector(".formfit-save");
    if (saveButton) saveButton.disabled = !parsedInput.selectedFile;

    syncPopupFileInput(popup, parsedInput);
}

function syncPopupFileInput(popup, parsedInput) {
    const fileInput = popup.querySelector(".formfit-file");
    if (!fileInput || !parsedInput.selectedFile || parsedInput.fileSource !== "form") return;

    try {
        const transfer = new DataTransfer();
        transfer.items.add(parsedInput.selectedFile);
        fileInput.files = transfer.files;
        console.log("Synced form file into popup input:", parsedInput.selectedFile.name);
    } catch (err) {
        console.log("Could not sync form file into popup input; keeping file in popup info:", err);
    }
}

function getFileInfoText(parsedInput) {
    if (!parsedInput.selectedFile) {
        return "No file selected. Add a file to enable confirmation.";
    }

    const info = parsedInput.fileInfo;
    const dimensions = info?.width && info?.height
        ? `, width: ${info.width}px, height: ${info.height}px`
        : ", width: unknown, height: unknown";

    return `Selected from ${parsedInput.fileSource}: ${info?.name || parsedInput.selectedFile.name}, size: ${info?.sizeLabel || "unknown"}${dimensions}`;
}

async function updateSelectedFileInfo(parsedInput) {
    if (!parsedInput.selectedFile) {
        parsedInput.fileInfo = null;
        return;
    }

    parsedInput.fileInfo = await getFileInfo(parsedInput.selectedFile);
}

async function getFileInfo(file) {
    const dimensions = await getImageDimensions(file);

    return {
        name: file.name,
        type: file.type || "unknown",
        size: file.size,
        sizeLabel: formatBytes(file.size),
        width: dimensions?.width || "",
        height: dimensions?.height || ""
    };
}

function getImageDimensions(file) {
    if (!file?.type?.startsWith("image/")) return Promise.resolve(null);

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        let resolved = false;

        img.onload = () => {
            if (!resolved) {
                resolved = true;
                const dimensions = {
                    width: img.naturalWidth,
                    height: img.naturalHeight
                };
                URL.revokeObjectURL(url);
                resolve(dimensions);
            }
        };

        img.onerror = () => {
            if (!resolved) {
                resolved = true;
                URL.revokeObjectURL(url);
                resolve(null);
            }
        };

        img.src = url;
        
        // Timeout fallback
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                URL.revokeObjectURL(url);
                resolve(null);
            }
        }, 5000);
    });
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ================================
// FALLBACK INPUT
// ================================
function createFallbackInput() {
    return {
        input: null,
        inputId: "manual",
        constraints: {
            inputType: "unknown",
            validFormats: [],
            maxSize: "",
            width: "",
            height: ""
        },
        confidence: 0,
        selectedFile: null,
        fileSource: null,
        fileInfo: null,
        confirmed: false
    };
}

// ================================
// STYLE
// ================================
function injectPopupStyles() {
    if (document.getElementById("formfit-style")) return;

    const s = document.createElement("style");
    s.id = "formfit-style";
    s.textContent = `
        #formfit-popup {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
        }

        .formfit-panel {
            background: white;
            border: 1px solid #ccc;
            width: 300px;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .formfit-header {
            background: #4f46e5;
            color: white;
            padding: 8px 10px;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #ddd;
            user-select: none;
            cursor: move;
        }

        .formfit-panel h3 {
            margin: 10px;
        }

        .formfit-file-info {
            margin: 0 10px 8px;
            padding: 7px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            font-size: 12px;
            color: #334155;
            line-height: 1.35;
        }

        .formfit-field {
            display: block;
            margin: 8px 10px;
        }

        .formfit-field span {
            display: block;
            margin-bottom: 3px;
            font-size: 12px;
            font-weight: 600;
            color: #333;
        }

        .formfit-panel input {
            width: calc(100% - 20px);
            margin: 5px 10px;
            padding: 5px;
            box-sizing: border-box;
        }

        .formfit-field input {
            width: 100%;
            margin: 0;
        }

        .formfit-panel button {
            width: calc(100% - 20px);
            margin: 10px;
            padding: 8px;
            cursor: pointer;
            background: #4f46e5;
            color: white;
            border: none;
            border-radius: 4px;
        }

        .formfit-panel button:hover {
            background: #4338ca;
        }

        .formfit-panel button:disabled {
            cursor: not-allowed;
            background: #a5b4fc;
        }

        .status {
            font-size: 12px;
            margin: 0 10px 8px;
            color: #666;
        }
    `;
    document.head.appendChild(s);
}

// ================================
// DOM TEXT EXTRACTION
// ================================
function getRelevantText(input) {
    const sources = [];

    const container =
        input.closest("form") ||
        input.closest("div") ||
        input.parentElement;

    if (container?.innerText) sources.push(container.innerText);
    if (input.accept) sources.push(input.accept);
    if (input.name) sources.push(input.name);

    return sources.join("\n");
}

// ================================
// CONSTRAINT PARSER
// ================================
function extractConstraints(text) {
    const result = {
        inputType: "unknown",
        validFormats: [],
        maxSize: "",
        width: "",
        height: ""
    };

    const lower = text.toLowerCase();

    const formatRegex = /\b(jpg|jpeg|png|gif|webp|pdf|zip|docx?|mp3)\b/gi;
    const matches = [...text.matchAll(formatRegex)];
    for (const m of matches) {
        const f = m[1].toUpperCase();
        if (!result.validFormats.includes(f)) result.validFormats.push(f);
    }

    if (lower.includes("any file")) result.validFormats = ["ANY"];

    if (lower.includes("image")) result.inputType = "image";
    if (lower.includes("document") || lower.includes("doc") || lower.includes("pdf")) result.inputType = "document";

    const sizeMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(KB|MB)/gi)];
    if (sizeMatches.length > 0) {
        let smallest = sizeMatches[0];
        for (const m of sizeMatches) {
            const curr = toKB(m[1], m[2]);
            const prev = toKB(smallest[1], smallest[2]);
            if (curr < prev) smallest = m;
        }
        result.maxSize = `${smallest[1]}${smallest[2].toUpperCase()}`;
    }

    const dim = text.match(/(\d{2,5})\s?(x|by)\s?(\d{2,5})/i);
    if (dim) {
        result.width = dim[1];
        result.height = dim[3];
    }

    return result;
}

// ================================
// CONFIDENCE SCORE
// ================================
function calculateConfidence(c) {
    let score = 0;
    if (c.inputType !== "unknown") score++;
    if (c.validFormats.length) score++;
    if (c.maxSize) score++;
    if (c.width && c.height) score++;
    return score;
}

function toKB(v, u) {
    return Number(v) * (u.toUpperCase() === "MB" ? 1024 : 1);
}