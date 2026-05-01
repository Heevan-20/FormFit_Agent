// FileProcessor.js

// ================================
// MAIN ENTRY
// ================================
export async function processFile(parsedInput) {
    if (!parsedInput.confirmed) {
        console.log("Skipping unconfirmed input:", parsedInput.inputId);
        return null;
    }

    const file = parsedInput.selectedFile;
    const constraints = parsedInput.constraints;

    if (!file) {
        console.log("No file provided for:", parsedInput.inputId);
        return null;
    }

    console.log("FileProcessor started:", {
        inputId: parsedInput.inputId,
        fileName: file.name,
        fileType: file.type,
        fileSizeKB: (file.size / 1024).toFixed(2),
        constraints
    });

    if (!file.type.startsWith("image/")) {
        console.log("Non-image file -> skipping image processing:", file.name);
        return buildPassthroughResult(file, parsedInput);
    }

    const img = await loadImage(file);

    const targetWidth = Number(constraints.width) || null;
    const targetHeight = Number(constraints.height) || null;
    const targetFormat = getTargetFormat(constraints.validFormats);
    const maxSizeKB = parseSize(constraints.maxSize);

    const targets = {
        targetWidth,
        targetHeight,
        targetFormat,
        maxSizeKB
    };

    console.log("FileProcessor targets:", targets);

    const decision = needsProcessing(file, img, targets);
    console.log("Processing decision:", decision);

    if (!decision.required) {
        console.log("No processing needed -> returning original");
        return buildResult(file, file, parsedInput, img, targetFormat, img.width, img.height);
    }

    const finalWidth = targetWidth || img.width;
    const finalHeight = targetHeight || img.height;

    console.log("Rendering processed image:", {
        originalWidth: img.width,
        originalHeight: img.height,
        finalWidth,
        finalHeight,
        targetFormat,
        maxSizeKB
    });

    const canvas = createCanvas(finalWidth, finalHeight);
    canvas.ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

    const blob = await compressCanvas(canvas.el, targetFormat, maxSizeKB);

    console.log("FileProcessor finished blob:", {
        type: blob.type,
        sizeKB: (blob.size / 1024).toFixed(2),
        width: finalWidth,
        height: finalHeight
    });

    return buildResult(file, blob, parsedInput, img, targetFormat, finalWidth, finalHeight);
}

// ================================
// DECISION ENGINE
// ================================
function needsProcessing(file, img, targets) {
    const currentSizeKB = file.size / 1024;
    const currentFormat = normalizeFormat(file.type.split("/")[1]);

    const widthMismatch = !!(targets.targetWidth && img.width !== targets.targetWidth);
    const heightMismatch = !!(targets.targetHeight && img.height !== targets.targetHeight);
    const sizeMismatch = !!(targets.maxSizeKB !== Infinity && currentSizeKB > targets.maxSizeKB);
    const formatMismatch = !!(targets.targetFormat && currentFormat !== targets.targetFormat);

    return {
        required: widthMismatch || heightMismatch || sizeMismatch || formatMismatch,
        widthMismatch,
        heightMismatch,
        sizeMismatch,
        formatMismatch
    };
}

// ================================
// HELPERS
// ================================
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        let resolved = false;

        img.onload = () => {
            if (resolved) return;
            resolved = true;
            URL.revokeObjectURL(url);
            console.log("Image loaded for processing:", {
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height
            });
            resolve(img);
        };

        img.onerror = () => {
            if (resolved) return;
            resolved = true;
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image"));
        };

        img.src = url;

        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            URL.revokeObjectURL(url);
            reject(new Error("Image loading timeout after 10 seconds"));
        }, 10000);
    });
}

function createCanvas(w, h) {
    const el = document.createElement("canvas");
    el.width = w;
    el.height = h;

    const ctx = el.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    return { el, ctx };
}

async function compressCanvas(canvas, format, maxSizeKB) {
    let quality = 0.92;
    let bestBlob = null;
    const maxAttempts = format === "PNG" ? 1 : 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const blob = await canvasToBlob(canvas, format, quality);
        bestBlob = blob;

        const sizeKB = blob.size / 1024;
        console.log("Compression attempt:", {
            attempt,
            format,
            quality: Number(quality.toFixed(2)),
            sizeKB: sizeKB.toFixed(2),
            maxSizeKB
        });

        if (maxSizeKB === Infinity || sizeKB <= maxSizeKB) {
            return blob;
        }

        quality = Math.max(0.1, quality - 0.1);
    }

    console.log("Could not reach target size; using smallest generated file:", {
        sizeKB: bestBlob ? (bestBlob.size / 1024).toFixed(2) : "",
        maxSizeKB
    });

    return bestBlob;
}

function canvasToBlob(canvas, format, quality) {
    const mimeType = `image/${format.toLowerCase()}`;

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error(`Canvas failed to create blob for ${mimeType}`));
                    return;
                }

                resolve(blob);
            },
            mimeType,
            quality
        );
    });
}

function parseSize(sizeStr) {
    if (!sizeStr) return Infinity;

    const match = String(sizeStr).match(/(\d+(?:\.\d+)?)(KB|MB)/i);
    if (!match) return Infinity;

    const value = Number(match[1]);
    const unit = match[2].toUpperCase();

    return unit === "MB" ? value * 1024 : value;
}

function getTargetFormat(validFormats) {
    if (!Array.isArray(validFormats) || validFormats.length === 0) return "JPEG";

    const formats = validFormats.map(normalizeFormat).filter(Boolean);

    if (formats.includes("JPEG")) return "JPEG";
    if (formats.includes("PNG")) return "PNG";
    if (formats.includes("WEBP")) return "WEBP";

    return "JPEG";
}

function normalizeFormat(format) {
    if (!format) return "";

    const upper = String(format).toUpperCase();
    if (upper === "JPG") return "JPEG";
    if (upper === "ANY") return "";

    return upper;
}

function changeExtension(fileName, newFormat) {
    const extension = newFormat === "JPEG" ? "jpg" : newFormat.toLowerCase();
    const base = fileName.split(".").slice(0, -1).join(".") || fileName;
    return `${base}.${extension}`;
}

// ================================
// RESULT BUILDER
// ================================
function buildResult(originalFile, blobOrFile, parsedInput, img, format, processedWidth, processedHeight) {
    const processedFile =
        blobOrFile instanceof File
            ? blobOrFile
            : new File(
                  [blobOrFile],
                  changeExtension(originalFile.name, format),
                  { type: `image/${format.toLowerCase()}` }
              );

    const result = {
        inputId: parsedInput.inputId,
        originalFile,
        processedFile,

        required: parsedInput.constraints,

        original: {
            name: originalFile.name,
            sizeKB: (originalFile.size / 1024).toFixed(2),
            type: originalFile.type,
            width: img.width,
            height: img.height
        },

        processed: {
            name: processedFile.name,
            sizeKB: (processedFile.size / 1024).toFixed(2),
            type: processedFile.type,
            width: processedWidth,
            height: processedHeight
        }
    };

    console.log("===== FORMFIT RESULT =====");
    console.log("Before:", result.original);
    console.log("After:", result.processed);
    console.log("Processed output constraints:", {
        name: result.processed.name,
        type: result.processed.type,
        sizeKB: result.processed.sizeKB,
        width: result.processed.width,
        height: result.processed.height,
        required: result.required
    });
    console.log("==========================");

    return result;
}

function buildPassthroughResult(file, parsedInput) {
    const result = {
        inputId: parsedInput.inputId,
        originalFile: file,
        processedFile: file,
        required: parsedInput.constraints,
        original: {
            name: file.name,
            sizeKB: (file.size / 1024).toFixed(2),
            type: file.type,
            width: "",
            height: ""
        },
        processed: {
            name: file.name,
            sizeKB: (file.size / 1024).toFixed(2),
            type: file.type,
            width: "",
            height: ""
        }
    };

    console.log("===== FORMFIT RESULT =====");
    console.log("Non-image passthrough:", result.processed);
    console.log("Processed output constraints:", {
        name: result.processed.name,
        type: result.processed.type,
        sizeKB: result.processed.sizeKB,
        width: result.processed.width,
        height: result.processed.height,
        required: result.required
    });
    console.log("==========================");

    return result;
}
