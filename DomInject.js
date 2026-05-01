// DomInject.js

// ================================
// MAIN ENTRY
// ================================
export function injectProcessedFile(parsedInput, processResult) {
    const processedFile = getProcessedFile(processResult);

    if (!parsedInput?.input) {
        return buildInjectionResult(parsedInput, processResult, processedFile, false, "No real form input found");
    }

    if (!processedFile) {
        return buildInjectionResult(parsedInput, processResult, null, false, "No processed file found");
    }

    try {
        setInputFiles(parsedInput.input, processedFile);
        updateParsedInput(parsedInput, processResult, processedFile);
        markInput(parsedInput.input, processedFile);
        notifyPage(parsedInput.input);

        const currentFile = parsedInput.input.files?.[0] || null;
        const wired = filesMatch(currentFile, processedFile);
        const injection = buildInjectionResult(
            parsedInput,
            processResult,
            processedFile,
            wired,
            wired ? "Processed file injected into input" : "Input file did not match processed file"
        );

        console.log("DomInject result:", injection);
        console.log("DomInject file changes:", buildFileChangeSummary(processResult, injection));
        postProcessedFile(injection, processedFile);

        return injection;
    } catch (error) {
        const injection = buildInjectionResult(
            parsedInput,
            processResult,
            processedFile,
            false,
            "Could not inject processed file",
            error
        );

        console.error("DomInject failed:", injection);
        return injection;
    }
}

// ================================
// INJECTION HELPERS
// ================================
function getProcessedFile(processResult) {
    return processResult?.processedFile || (processResult instanceof File ? processResult : null);
}

function setInputFiles(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);

    const filesSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "files"
    )?.set;

    if (filesSetter) {
        filesSetter.call(input, transfer.files);
    } else {
        input.files = transfer.files;
    }
}

function updateParsedInput(parsedInput, processResult, processedFile) {
    parsedInput.selectedFile = processedFile;
    parsedInput.fileSource = "processed";
    parsedInput.processedFile = processedFile;
    parsedInput.fileInfo = {
        name: processedFile.name,
        size: processedFile.size,
        sizeLabel: formatBytes(processedFile.size),
        type: processedFile.type,
        width: processResult?.processed?.width || "",
        height: processResult?.processed?.height || ""
    };
}

function markInput(input, processedFile) {
    input.dataset.formfitFileState = "processed";
    input.dataset.formfitProcessedName = processedFile.name;
    input.dataset.formfitProcessedSize = String(processedFile.size);
    input.dataset.formfitProcessedType = processedFile.type;
}

function notifyPage(input) {
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function filesMatch(currentFile, processedFile) {
    return currentFile?.name === processedFile.name &&
        currentFile?.size === processedFile.size &&
        currentFile?.type === processedFile.type;
}

// ================================
// RESULT + CONSOLE SHAPE
// ================================
function buildInjectionResult(parsedInput, processResult, processedFile, wired, message, error = null) {
    const inputFile = parsedInput?.input?.files?.[0] || null;
    const processed = processResult?.processed || {};

    return {
        inputId: parsedInput?.inputId || "",
        message,
        wiredToInput: wired,
        processedFile,
        processedConstraints: {
            inputId: parsedInput?.inputId || "",
            fileName: processedFile?.name || processed.name || "",
            fileType: processedFile?.type || processed.type || "",
            size: processedFile?.size || null,
            sizeLabel: processedFile ? formatBytes(processedFile.size) : "",
            sizeKB: processed.sizeKB || (processedFile ? (processedFile.size / 1024).toFixed(2) : ""),
            width: processed.width || "",
            height: processed.height || "",
            required: processResult?.required || {},
            wiredToInput: wired,
            actualInputFile: inputFile
                ? {
                    name: inputFile.name,
                    type: inputFile.type,
                    size: inputFile.size,
                    sizeLabel: formatBytes(inputFile.size)
                }
                : null
        },
        error
    };
}

function buildFileChangeSummary(processResult, injection) {
    const original = processResult?.original || {};
    const processed = processResult?.processed || {};

    return {
        inputId: injection.inputId,
        uploadedSuccessfully: injection.wiredToInput,
        name: {
            before: original.name || "",
            after: processed.name || injection.processedConstraints.fileName || "",
            changed: Boolean(original.name && processed.name && original.name !== processed.name)
        },
        type: {
            before: original.type || "",
            after: processed.type || injection.processedConstraints.fileType || "",
            changed: Boolean(original.type && processed.type && original.type !== processed.type)
        },
        sizeKB: {
            before: original.sizeKB || "",
            after: processed.sizeKB || injection.processedConstraints.sizeKB || "",
            changed: Boolean(original.sizeKB && processed.sizeKB && original.sizeKB !== processed.sizeKB)
        },
        width: {
            before: original.width || "",
            after: processed.width || injection.processedConstraints.width || "",
            changed: Boolean(original.width && processed.width && original.width !== processed.width)
        },
        height: {
            before: original.height || "",
            after: processed.height || injection.processedConstraints.height || "",
            changed: Boolean(original.height && processed.height && original.height !== processed.height)
        },
        required: processResult?.required || {}
    };
}

function postProcessedFile(injection, processedFile) {
    window.postMessage({
        source: "formfit-processed-file",
        file: processedFile,
        result: {
            inputId: injection.inputId,
            wiredToInput: injection.wiredToInput,
            processed: injection.processedConstraints
        }
    }, "*");

    window.postMessage({
        source: "formfit-processed-constraints",
        constraints: injection.processedConstraints
    }, "*");
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
