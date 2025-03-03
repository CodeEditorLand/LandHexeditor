// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import TelemetryReporter from "@vscode/extension-telemetry";
import * as vscode from "vscode";

import { HexDocumentEditOp } from "../shared/hexDocumentModel";
import { openCompareSelected } from "./compareSelected";
import { copyAs } from "./copyAs";
import { DataInspectorView } from "./dataInspectorView";
import { showGoToOffset } from "./goToOffset";
import { HexDiffFSProvider } from "./hexDiffFS";
import { HexEditorProvider } from "./hexEditorProvider";
import { HexEditorRegistry } from "./hexEditorRegistry";
import { prepareLazyInitDiffWorker } from "./initWorker";
import { showSelectBetweenOffsets } from "./selectBetweenOffsets";
import StatusEditMode from "./statusEditMode";
import StatusFocus from "./statusFocus";
import StatusHoverAndSelection from "./statusHoverAndSelection";

function readConfigFromPackageJson(extension: vscode.Extension<any>): {
	extId: string;

	version: string;

	aiKey: string;
} {
	const packageJSON = extension.packageJSON;

	return {
		extId: `${packageJSON.publisher}.${packageJSON.name}`,
		version: packageJSON.version,
		aiKey: packageJSON.aiKey,
	};
}

function reopenWithHexEditor() {
	const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab
		?.input as {
		[key: string]: any;

		uri: vscode.Uri | undefined;
	};

	if (activeTabInput.uri) {
		vscode.commands.executeCommand(
			"vscode.openWith",
			activeTabInput.uri,
			"hexEditor.hexedit",
		);
	}
}

export async function activate(context: vscode.ExtensionContext) {
	// Prepares the worker to be lazily initialized
	const initWorker = prepareLazyInitDiffWorker(
		context.extensionUri,
		(workerDispose) => context.subscriptions.push(workerDispose),
	);

	const registry = new HexEditorRegistry(initWorker);
	// Register the data inspector as a separate view on the side
	const dataInspectorProvider = new DataInspectorView(
		context.extensionUri,
		registry,
	);

	const configValues = readConfigFromPackageJson(context.extension);

	context.subscriptions.push(
		registry,
		dataInspectorProvider,
		vscode.window.registerWebviewViewProvider(
			DataInspectorView.viewType,
			dataInspectorProvider,
		),
	);

	const telemetryReporter = new TelemetryReporter(
		configValues.extId,
		configValues.version,
		configValues.aiKey,
	);

	context.subscriptions.push(telemetryReporter);

	const openWithCommand = vscode.commands.registerCommand(
		"hexEditor.openFile",
		reopenWithHexEditor,
	);

	const goToOffsetCommand = vscode.commands.registerCommand(
		"hexEditor.goToOffset",
		() => {
			const first = registry.activeMessaging[Symbol.iterator]().next();

			if (first.value) {
				showGoToOffset(first.value);
			}
		},
	);

	const selectBetweenOffsetsCommand = vscode.commands.registerCommand(
		"hexEditor.selectBetweenOffsets",
		() => {
			const first = registry.activeMessaging[Symbol.iterator]().next();

			if (first.value) {
				showSelectBetweenOffsets(first.value, registry);
			}
		},
	);

	const copyAsCommand = vscode.commands.registerCommand(
		"hexEditor.copyAs",
		() => {
			const first = registry.activeMessaging[Symbol.iterator]().next();

			if (first.value) {
				copyAs(first.value);
			}
		},
	);

	const switchEditModeCommand = vscode.commands.registerCommand(
		"hexEditor.switchEditMode",
		() => {
			if (registry.activeDocument) {
				registry.activeDocument.editMode =
					registry.activeDocument.editMode ===
					HexDocumentEditOp.Insert
						? HexDocumentEditOp.Replace
						: HexDocumentEditOp.Insert;
			}
		},
	);

	const copyOffsetAsHex = vscode.commands.registerCommand(
		"hexEditor.copyOffsetAsHex",
		() => {
			if (registry.activeDocument) {
				const focused = registry.activeDocument.selectionState.focused;

				if (focused !== undefined) {
					vscode.env.clipboard.writeText(
						focused.toString(16).toUpperCase(),
					);
				}
			}
		},
	);

	const copyOffsetAsDec = vscode.commands.registerCommand(
		"hexEditor.copyOffsetAsDec",
		() => {
			if (registry.activeDocument) {
				const focused = registry.activeDocument.selectionState.focused;

				if (focused !== undefined) {
					vscode.env.clipboard.writeText(focused.toString());
				}
			}
		},
	);

	const compareSelectedCommand = vscode.commands.registerCommand(
		"hexEditor.compareSelected",
		async (...args) => {
			if (args.length !== 2 && !(args[1] instanceof Array)) {
				return;
			}

			const [leftFile, rightFile] = args[1];

			if (
				!(
					leftFile instanceof vscode.Uri &&
					rightFile instanceof vscode.Uri
				)
			) {
				return;
			}

			openCompareSelected(leftFile, rightFile);
		},
	);

	context.subscriptions.push(new StatusEditMode(registry));

	context.subscriptions.push(new StatusFocus(registry));

	context.subscriptions.push(new StatusHoverAndSelection(registry));

	context.subscriptions.push(goToOffsetCommand);

	context.subscriptions.push(selectBetweenOffsetsCommand);

	context.subscriptions.push(copyAsCommand);

	context.subscriptions.push(switchEditModeCommand);

	context.subscriptions.push(openWithCommand);

	context.subscriptions.push(telemetryReporter);

	context.subscriptions.push(copyOffsetAsDec, copyOffsetAsHex);

	context.subscriptions.push(compareSelectedCommand);

	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider(
			"hexdiff",
			new HexDiffFSProvider(),
			{
				isCaseSensitive:
					typeof process !== "undefined" &&
					process.platform !== "win32" &&
					process.platform !== "darwin",
			},
		),
	);

	context.subscriptions.push(
		HexEditorProvider.register(
			context,
			telemetryReporter,
			dataInspectorProvider,
			registry,
		),
	);
}

export function deactivate(): void {
	/* no-op */
}
