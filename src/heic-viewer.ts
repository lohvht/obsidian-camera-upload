import { App, type MarkdownPostProcessorContext } from 'obsidian';
import { isHeic, heicTo } from 'heic-to';
import { EditorView, type PluginValue } from '@codemirror/view';

function imageTag(imgSrc: string, width?: number, height?: number) {
    // dynamically create and replace div's children w/ the newly created JPG image
    const img = document.createElement("img");
    if (width) {

        img.width = width;
        img.style.width = `${width}px`;
    }
    if (height) {

        img.height = height;
        img.style.height = `${height}px`;
    }
    img.src = imgSrc;
    return img;
}


async function getHeicImageAsJpeg(app: App, imageSrc: string, documentSrcPath: string): Promise<string | undefined> {
    if ([".heic", ".heif"].every(ext => !imageSrc.endsWith(ext))) {
        return undefined;
    }
    const linkFile = app.metadataCache.getFirstLinkpathDest(imageSrc, documentSrcPath);
    const linkPath = linkFile ? linkFile.path : imageSrc;
    const normalisedPath = app.vault.adapter.getResourcePath(linkPath);
    const found = app.loadLocalStorage(normalisedPath);
    if (found) {
        const { dataURL, expiresAt } = JSON.parse(found);
        if (Date.now() < expiresAt) {
            return dataURL;
        }
        app.saveLocalStorage(normalisedPath, null);
    }
    const imgBlob = await fetch(normalisedPath).then((f) => f.blob());
    const imgFile = new File([imgBlob], imageSrc, { type: imgBlob.type })
    if (!(await isHeic(imgFile))) {
        return undefined;
    }
    const imgJpegBlob = await heicTo({
        blob: imgFile,
        type: "image/jpeg",
        quality: 0.5
    });
    const dataURL = await dataURLFromBlob(imgJpegBlob);
    app.saveLocalStorage(normalisedPath, JSON.stringify({
        dataURL,
        expiresAt: Date.now() + 300 * 1000,
    }));
    return dataURL
}

async function dataURLFromBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onloadend = () => {
            if (fr.result) {
                // @ts-expect-error
                resolve(fr.result);
                return;
            }
            reject(fr.error);
        };
        fr.readAsDataURL(blob)
    });
}


async function overwriteEmbed(app: App, internalEmbed: Element, selectionView?: EditorView, docSrc?: string) {
    const docSrcStr = docSrc ? docSrc : app.workspace.getActiveFile()?.path;
    if (!docSrcStr) {
        return;
    }
    const heicOverrideAttr = "data-heic-override";
    if (internalEmbed.hasAttribute(heicOverrideAttr)) {
        return;
    }
    const src = internalEmbed.getAttribute('src');
    if (!src) {
        return;
    }
    const wStr = internalEmbed.getAttribute("width");
    const w = wStr ? parseInt(wStr) : undefined;
    const hStr = internalEmbed.getAttribute("height");
    const h = hStr ? parseInt(hStr) : undefined;
    const blobPath = await getHeicImageAsJpeg(app, src, docSrcStr);
    if (!blobPath) {
        return;
    }
    const img = imageTag(blobPath, w, h);

    // Replace the classes expected for showin an image
    internalEmbed.toggleAttribute(heicOverrideAttr);
    internalEmbed.classList.remove("file-embed");
    internalEmbed.classList.remove("mod-generic");
    internalEmbed.classList.add("media-embed");
    internalEmbed.classList.add("image-embed");
    internalEmbed.removeAttribute("alt");
    internalEmbed.replaceChildren(img);

    if (selectionView) {
        const from = selectionView.posAtDOM(internalEmbed);
        img.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            selectionView.dispatch({
                selection: { anchor: from, /*head: to */ },
                scrollIntoView: true,
            })
            selectionView.focus();
        });
    }
}

export function heicViewLiveEditorPlugin(app: App) {
    return class implements PluginValue {
        observer: MutationObserver;

        constructor(view: EditorView) {
            this.observer = new MutationObserver(mutations => {
                for (const m of mutations) {
                    m.addedNodes.forEach((node) => {
                        if (!(node instanceof HTMLElement)) {
                            return;
                        }
                        // Case 1: Direct embed
                        if (node.classList.contains("internal-embed")) {
                            overwriteEmbed(app, node, view);
                        }
                        // Case 2: embed in descendents
                        node.querySelectorAll(".internal-embed").forEach(embed => {
                            overwriteEmbed(app, embed, view);
                        });
                    });
                }
            });
            this.observer.observe(view.dom, { childList: true, subtree: true });
        }

        destroy(): void {
            this.observer.disconnect();
        }
    }
}

export function heicViewReadingModeMarkdownPostProcessor(app: App) {
    return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        const internalEmbed = el.querySelector('.internal-embed');
        if (!internalEmbed) {
            return;
        }
        await overwriteEmbed(app, internalEmbed, undefined, ctx.sourcePath);
    }
}
