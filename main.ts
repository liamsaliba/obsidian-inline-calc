import { init, formula, ExpressionParser } from "expressionparser";
import { ExpressionValue } from "expressionparser/dist/ExpressionParser";
import {
	Plugin,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	MarkdownView,
	TFile,
} from "obsidian";

type Expr = ExpressionValue | string;

const delegates: { [key:string]: number } = {
	'π': Math.PI,
	PHI: Math.PI * 2,
}

class InlineCalc extends EditorSuggest<Expr> {
	plugin: InlineCalcPlugin;
	pattern: RegExp;
	lastEditorSuggestTriggerInfo: EditorSuggestTriggerInfo;
	parser: ExpressionParser;

	constructor(plugin: InlineCalcPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.pattern = /([^=]*)=$/;
		this.parser = init(formula, (term) => {
			if (term in delegates) {
				return delegates[term];
			}
			throw new Error(`Invalid term: ${term}`);
		});
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		_file: TFile
	): EditorSuggestTriggerInfo | null {
		const range = editor.getRange(
			{ line: cursor.line, ch: 0 },
			{ line: cursor.line, ch: cursor.ch }
		);
		const testResults = this.pattern.exec(range);
		if (!testResults) return null;
		else {
			const suggestText = testResults[1];
			this.lastEditorSuggestTriggerInfo = {
				start: {
					line: cursor.line,
					ch: cursor.ch - suggestText.length - 1,
				},
				end: { line: cursor.line, ch: cursor.ch },
				query: testResults[1],
			};
			return this.lastEditorSuggestTriggerInfo;
		}
	}

	getSuggestions(context: EditorSuggestContext): Expr[] {
		let candidates = context.query
			.split(" ")
			.filter((x) => x !== "")
			.reduceRight<string[]>(
				(acc, v) => [[v, acc[0]].join(" ").trim(), ...acc],
				[]
			);

		for (let candidate of candidates) {
			try {
				let value = this.parser.expressionToValue(candidate.toUpperCase());
				return [value];
			} catch (e) {}
		}
		return [];
		// return [new Expr(context.query)];
	}

	renderSuggestion(item: Expr, el: HTMLElement): void {
		el.createEl("span", { text: `↵ ${item}` });
	}

	selectSuggestion(item: Expr, evt: MouseEvent | KeyboardEvent): void {
		const currentView =
			this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		this.close();
		const result = ` ${item}`;
		if (currentView) {
			currentView.editor.replaceRange(
				result,
				this.lastEditorSuggestTriggerInfo.end,
				this.lastEditorSuggestTriggerInfo.end
			);

			currentView.editor.setCursor({
				line: this.lastEditorSuggestTriggerInfo.end.line,
				ch: this.lastEditorSuggestTriggerInfo.end.ch + result.length,
			});
		}
	}
}

export default class InlineCalcPlugin extends Plugin {
	async onload() {
		this.registerEditorSuggest(new InlineCalc(this));
	}
}
