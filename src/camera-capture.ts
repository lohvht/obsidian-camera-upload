import { App, Modal, Notice, Setting, type Editor } from "obsidian";
import type { CameraUploadSettings } from "./settings.js";

function humanReadableFileSize(fsize: number, dp: number) {
    let bytes = fsize;
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let u = 0;
    while (Math.round(bytes) >= 1024 && u < units.length - 1) {
        bytes /= 1024;
        u++;
    }
    if (u == 0) {
        return `${bytes} ${units[u]}`;
    }
    return `${bytes.toFixed(dp)} ${units[u]}`;
}

class FileSaveModal extends Modal {
    constructor(
        app: App,
        settings: CameraUploadSettings,
        file: File,
        onSubmit: (dir: string, filename: string, insertLink: boolean, f: File) => Promise<void>,
    ) {
        super(app);

        const date = window.moment().format("YYYY-MM-DD_HHmmss");
        let dir = settings.defaultDirectory;
        const ext = file.name.split('.').pop();
        const extWithDot = ext ? `.${ext}` : '';
        let filename = `${date}${extWithDot}`;
        let insertLink = true;

        this.setTitle(`File size: ${humanReadableFileSize(file.size, 2)}`);

        new Setting(this.contentEl)
            .setName("Save to folder")
            .addText((t) => t
                .setPlaceholder("Folder within vault")
                .setValue(dir)
                .onChange(v => { dir = v.trim() })
            );

        new Setting(this.contentEl)
            .setName("Filename")
            .addText((t) => t
                .setPlaceholder('filename.ext')
                .setValue(filename)
                .onChange(v => { filename = v.trim() })
            );

        new Setting(this.contentEl)
            .setName("Insert link into current document")
            .addToggle((t) => t
                .setValue(insertLink)
                .onChange(v => { insertLink = v })
            );


        new Setting(this.contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('❌ Cancel')
                    .onClick(() => {
                        this.close();
                    }))
            .addButton((btn) =>
                btn
                    .setButtonText('💾 Save')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        onSubmit(dir, filename, insertLink, file);
                    }));
    }
}

async function saveMedia(
    app: App,
    containingDir: string,
    filename: string,
    file: File,
) {
    const arrayBuffer = await file.arrayBuffer();
    await app.vault.adapter.mkdir(containingDir);

    const mediaPath = `${containingDir}/${filename}`;
    await app.vault.createBinary(mediaPath, arrayBuffer);
    return mediaPath;
}

function replaceSelection(editor: Editor, mediaPath: string) {
    const linkText = `![[${mediaPath}]]`;
    editor.replaceSelection(linkText);
}

export function captureAndInsert(
    settings: CameraUploadSettings,
    app: App,
    editor: Editor,
    mode: "image" | "video",
) {

    const input = document.createElement("input");
    input.type = "file";
    input.accept = mode === "image" ? "image/*" : "video/*";
    input.capture = "environment";
    input.style.display = "none";

    input.onchange = async () => {
        const file = input.files?.item(0);
        if (!file) {
            return new Notice("No file captured.");
        }
        new FileSaveModal(app, settings, file, async (dir, fn, insertLink, f) => {
            try {
                const p = await saveMedia(app, dir, fn, f);
                if (!insertLink) {
                    new Notice(`Saved to ${p}`);
                    return;
                }
                replaceSelection(editor, p);
                new Notice(`Saved to and linked ${p}`);
            } catch (e) {
                console.error("SAVING MEDIA FAILED: ", e);
                new Notice("Error saving media");
            }
        }).open();
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}
