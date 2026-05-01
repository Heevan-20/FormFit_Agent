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

    if (!file.type.startsWith("image/")) {
        console.log("Non-image file → skipping:", file.name);
        return buildPassthroughResult(file, parsedInput);
    }

    const img = await loadImage(file);

    const targetWidth = Number(constraints.width) || null;
    const targetHeight = Number(constraints.height) || null;
    const targetFormat = getTargetFormat(constraints.validFormats);
    const maxSizeKB = parseSize(constraints.maxSize);

    // ================================
    // DECISION ENGINE
    // ================================
    const decision = needsProcessing(file, img, {
        targetWidth,
        targetHeight,
        targetFormat,
        maxSizeKB
    });

    console.log("Processing decision:", decision);

    // ================================
    // EARLY EXIT (BEST CASE)
    // ================================
    if (!decision.required) {
        console.log("No processing needed → returning original");

        return buildResult(file, file, parsedInput, img, targetFormat);
    }

    // ================================
    // FORMAT ONLY
    // ================================
    if (
        decision.formatMismatch &&
        !decision.sizeMismatch &&
        !decision.widthMismatch &&
        !decision.heightMismatch
    ) {
        console.log("Only format change needed");

        const canvas = createCanvas(img.width, img.height);
        canvas.ctx.drawImage(img, 0, 0);

        const blob = await canvasToBlob(canvas.el, targetFormat, 0.95);

        return buildResult(file, blob, parsedInput, img, targetFormat);
    }

    // ================================
    // SIZE ONLY (compress, no resize)
    // ================================
    if (
        decision.sizeMismatch &&
        !decision.widthMismatch &&
        !decision.heightMismatch
    ) {
        console.log("Only size compression needed");

        const canvas = createCanvas(img.width, img.height);
        canvas.ctx.drawImage(img, 0, 0);

        let quality = 0.9;
        let blob = await canvasToBlob(canvas.el, targetFormat, quality);

        while (blob.size / 1024 > maxSizeKB && quality > 0.1) {
            quality -= 0.1;
            blob = await canvasToBlob(canvas.el, targetFormat, quality);
        }

        return buildResult(file, blob, parsedInput, img, targetFormat);
    }

    // ================================
    // RESIZE (or combined case)
    // ================================
    console.log("Resize / combined processing");

    const finalWidth = targetWidth || img.width;
    const finalHeight = targetHeight || img.height;

    const canvas = createCanvas(finalWidth, finalHeight);
    canvas.ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

    let quality = 0.9;
    let blob = await canvasToBlob(canvas.el, targetFormat, quality);

    while (blob.size / 1024 > maxSizeKB && quality > 0.1) {
        quality -= 0.1;
        blob = await canvasToBlob(canvas.el, targetFormat, quality);
    }

    return buildResult(file, blob, parsedInput, img, targetFormat);
}

// ================================
// DECISION ENGINE
// ================================
function needsProcessing(file, img, targets) {
    const currentSizeKB = file.size / 1024;
    const currentFormat = file.type.split("/")[1]?.toUpperCase();

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
            if (!resolved) {
                resolved = true;
                URL.revokeObjectURL(url);
                resolve(img);
            }
        };
        
        img.onerror = (err) => {
            if (!resolved) {
                resolved = true;
                URL.revokeObjectURL(url);
                reject(err || new Error("Failed to load image"));
            }
        };
        
        img.src = url;
        
        // Timeout fallback
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                URL.revokeObjectURL(url);
                reject(new Error("Image loading timeout after 10 seconds"));
            }
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

function canvasToBlob(canvas, format, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => resolve(blob),
            `image/${format.toLowerCase()}`,
            quality
        );
    });
}

function parseSize(sizeStr) {
    if (!sizeStr) return Infinity;

    const match = sizeStr.match(/(\d+(?:\.\d+)?)(KB|MB)/i);
    if (!match) return Infinity;

    const value = Number(match[1]);
    const unit = match[2].toUpperCase();

    return unit === "MB" ? value * 1024 : value;
}

function getTargetFormat(validFormats) {
    if (!validFormats || validFormats.length === 0) return "JPEG";

    if (validFormats.includes("JPEG")) return "JPEG";
    if (validFormats.includes("JPG")) return "JPEG";
    if (validFormats.includes("PNG")) return "PNG";

    return validFormats[0];
}

function changeExtension(fileName, newFormat) {
    const base = fileName.split(".").slice(0, -1).join(".") || fileName;
    return `${base}.${newFormat.toLowerCase()}`;
}

// ================================
// RESULT BUILDER
// ================================
function buildResult(originalFile, blobOrFile, parsedInput, img, format) {
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
            width: processedFile === originalFile ? img.width : (Number(parsedInput.constraints.width) || img.width),
            height: processedFile === originalFile ? img.height : (Number(parsedInput.constraints.height) || img.height)
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