import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import {
	ViewPlugin,
} from '@codemirror/view';
import { heicViewLiveEditorPlugin, heicViewReadingModeMarkdownPostProcessor } from 'src/heic-viewer.js';
import { DEFAULT_SETTINGS, type CameraUploadSettings } from 'src/settings.js';
import { captureAndInsert } from 'src/camera-capture.js';


class CameraUploadSettingTab extends PluginSettingTab {
	plugin: CameraUploadPlugin;

	constructor(app: App, plugin: CameraUploadPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const settings = new Setting(containerEl);

		settings
		new Setting(containerEl)
			.setName('Default Directory')
			.setDesc('Relative path to a directory to save new photos and videos taken')
			.addText(text => text
				.setPlaceholder('camera-upload')
				.setValue(this.plugin.settings.defaultDirectory)
				.onChange(async (value) => {
					this.plugin.settings.defaultDirectory = value.trim();
					await this.plugin.saveSettings();
				}));
	}
}


export default class CameraUploadPlugin extends Plugin {
	// @ts-expect-error
	settings: CameraUploadSettings;

	async onload() {
		this.registerMarkdownPostProcessor(heicViewReadingModeMarkdownPostProcessor(this.app));
		this.registerEditorExtension([
			ViewPlugin.fromClass(heicViewLiveEditorPlugin(this.app)),
		]);

		await this.loadSettings();
		this.addSettingTab(new CameraUploadSettingTab(this.app, this));
		this.addCommand({
			id: "open-camera-capture-photo",
			name: "Open Camera and Capture Photo",
			editorCallback: (editor, _) => captureAndInsert(this.settings, this.app, editor, "image"),
		});
		this.addCommand({
			id: "open-camera-capture-video",
			name: "Open Camera and Capture Video",
			editorCallback: (editor, _) => captureAndInsert(this.settings, this.app, editor, "video"),
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
