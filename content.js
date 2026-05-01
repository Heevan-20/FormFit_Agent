// content.js
console.log("Content Script Loaded");

// Initialize global variables
window.formFitProcessedResults = [];
window.formFitLastProcessedFile = null;
window.formFitLastProcessedURL = null;

async function init() {
    try {
        resetFormFitGlobals();
        installPageBridge();

        console.log("Step 1: loading analyzer");

        // Try both capitalizations
        let analyzer;
        try {
            analyzer = await import(chrome.runtime.getURL("domAnalyzer.js"));
        } catch (e) {
            console.log("Trying alternative capitalization...");
            analyzer = await import(chrome.runtime.getURL("DomAnalyzer.js"));
        }

        const { analyzeAndConfirm } = analyzer;
        console.log("Step 2: analyzer loaded");

        const { processFile } = await import(
            chrome.runtime.getURL("FileProcessor.js")
        );
        console.log("Step 3: processor loaded");

        const { injectProcessedFile } = await import(
            chrome.runtime.getURL("DomInject.js")
        );
        console.log("Step 4: injector loaded");

        const finalInputs = await analyzeAndConfirm();
        console.log("AFTER ANALYSIS:", finalInputs);

        const processedResults = [];

        for (const input of finalInputs) {
            try {
                console.log("Processing input:", input.inputId);
                const result = await processFile(input);

                if (!result) continue;

                console.log("Calling DomInject for:", input.inputId);
                const injection = injectProcessedFile(input, result);
                result.injection = injection;
                result.wiredToInput = injection.wiredToInput;
                result.processedConstraints = injection.processedConstraints;

                processedResults.push(result);

                console.log("Processed file constraints:", result.processedConstraints);
            } catch (err) {
                console.error("Processing/injection failed for input:", {
                    inputId: input.inputId,
                    error: err
                });
            }
        }

        updateFormFitGlobals(processedResults);

        console.log("AFTER PROCESSING:", processedResults);
        console.log("Final processed file:", window.formFitLastProcessedFile);
        console.log("Final processed file URL:", window.formFitLastProcessedURL);
    } catch (err) {
        console.error("PIPELINE BROKE:", err);
    }
}

function resetFormFitGlobals() {
    window.formFitProcessedResults = [];
    window.formFitLastProcessedFile = null;

    if (window.formFitLastProcessedURL) {
        URL.revokeObjectURL(window.formFitLastProcessedURL);
    }

    window.formFitLastProcessedURL = null;
}

function updateFormFitGlobals(processedResults) {
    window.formFitProcessedResults = processedResults;
    window.formFitLastProcessedFile = processedResults.at(-1)?.processedFile || null;
    window.formFitLastProcessedConstraints = processedResults.at(-1)?.processedConstraints || null;

    if (window.formFitLastProcessedURL) {
        URL.revokeObjectURL(window.formFitLastProcessedURL);
    }

    window.formFitLastProcessedURL = window.formFitLastProcessedFile
        ? URL.createObjectURL(window.formFitLastProcessedFile)
        : null;
}

function installPageBridge() {
    if (document.getElementById("formfit-page-bridge")) return;

    try {
        const script = document.createElement("script");
        script.id = "formfit-page-bridge";
        script.textContent = `
            window.formFitProcessedResults = window.formFitProcessedResults || [];
            window.formFitLastProcessedFile = null;
            window.formFitLastProcessedResult = null;
            window.formFitLastProcessedConstraints = null;

            window.addEventListener("message", (event) => {
                if (event.source !== window) return;

                if (event.data?.source === "formfit-processed-file") {
                    window.formFitLastProcessedFile = event.data.file;
                    window.formFitLastProcessedResult = event.data.result;

                    if (event.data.result && event.data.result.inputId) {
                        window.formFitProcessedResults.push(event.data.result);
                        console.log("FormFit page-context: Added processed result for:", event.data.result.inputId);
                    }

                    console.log("FormFit page-context processed file:", window.formFitLastProcessedFile?.name);
                }

                if (event.data?.source === "formfit-processed-constraints") {
                    window.formFitLastProcessedConstraints = event.data.constraints;
                    console.log("FormFit page-context processed constraints:", window.formFitLastProcessedConstraints);
                }
            });

            console.log("FormFit page bridge installed successfully");
        `;

        (document.head || document.documentElement).appendChild(script);
        script.remove();
    } catch (err) {
        console.log("Page-context bridge unavailable; content-script logs still work:", err);
    }
}

// Start the extension
init();
