FormFit Agent

An intelligent client-side file optimization browser extension that automatically adapts uploaded files to satisfy dynamic web form constraints.

Features
- DOM analysis to detect form file requirements (size, format, dimensions)
- Real-time image compression, resizing & format conversion
- PDF optimization using pdf-lib
- Smart fallback optimization when constraints are not visible
- Seamless integration using File & DataTransfer APIs

Tech Stack
- JavaScript 
- Canvas API, pdf-lib
- DOM Parsing & MutationObserver
- Chrome Extension APIs

How it Works
1. Detects file input fields and their constraints
2. Intercepts upload attempts
3. Optimizes file on-the-fly
4. Replaces file before submission

Installation (Development)
1. Clone the repo
2. Go to `chrome://extensions/`
3. Enable Developer Mode
4. Load unpacked → Select the project folder

Links
GitHub: [FormFit_Agent](https://github.com/Heevan-20/FormFit_Agent)
