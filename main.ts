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

import {makeTaggedUnion, MemberType} from "safety-match";

const InlineCalcResultVariant = makeTaggedUnion({
	LaTeX: (latex: string, offset: number) => ({latex, offset}),
	ExpressionValue: (value: ExpressionValue) => value,
});

type InlineCalcResult = MemberType<typeof InlineCalcResultVariant>

const delegates: { [key:string]: number } = {
	'π': Math.PI,
	'ϕ': Math.PI * 2,
	'φ': Math.PI * 2,
	PHI: Math.PI * 2,
}

const infixDelegates: { [key:string]: string } = {
	'×': '*',
	'⋅': '*',
	'÷': '/',
}

class InlineCalc extends EditorSuggest<InlineCalcResult> {
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
		const {line, ch} = cursor;
		const range = editor.getRange(
			{ line, ch: 0 },
			cursor
		);
		const testResults = this.pattern.exec(range);
		if (!testResults) return null;
		else {
			const query = testResults[1]
				// capitalise a-z (don't capitalise all unicode, as π -> Π)
				.replace(/[a-z]*/g, str => str.toUpperCase())
				// replace × with * and stuff
				.split('').map(l => infixDelegates[l] || l).join('');

			this.lastEditorSuggestTriggerInfo = {
				start: {
					line,
					ch: ch - query.length - 1,
				},
				end: cursor,
				query,
			};

			return this.lastEditorSuggestTriggerInfo;
		}
	}

	getSuggestions(context: EditorSuggestContext): InlineCalcResult[] {
		if (context.query == "") return [];

		for (let m, reg = /\S+/g; m = reg.exec(context.query); ) {
			const candidate = context.query.substring(m.index);
			try {
				let value = this.parser.expressionToValue(candidate);
				return [
					InlineCalcResultVariant.ExpressionValue(value),
					InlineCalcResultVariant.LaTeX(
						`\$${candidate}= ${value}\$`, 
						context.query.length - m.index
					),
				];
			} catch (e) {
				// console.error(e);
			}
		}
		// nothing found; but let's not bother the user
		return [];
	}

	renderSuggestion(item: InlineCalcResult, el: HTMLElement): void {
		const text = item.match({
			ExpressionValue: (v) => `↵ ${v}`,
			LaTeX: (_) => '$ Insert as LaTeX',
		})
		el.createEl("span", { text });
	}

	selectSuggestion(item: InlineCalcResult, _: MouseEvent | KeyboardEvent): void {
		const currentView =
			this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		this.close();
		if (!currentView) return;
		const end = this.lastEditorSuggestTriggerInfo.end;
		const {suggestion, offset} = item.match({
			ExpressionValue: (value) => ({suggestion: ` ${value}`, offset: 0}),
			LaTeX: ({latex, offset}) => ({suggestion: latex, offset: offset + 1}),
		});

		// insert the result after = with a space
		currentView.editor.replaceRange(
			suggestion,
			{
				line: end.line,
				ch: end.ch - offset,
			},
			end
		);
		// put the cursor after the inserted result
		currentView.editor.setCursor({
			line: end.line,
			ch: end.ch - offset + suggestion.length,
		});
	}
}

export default class InlineCalcPlugin extends Plugin {
	async onload() {
		this.registerEditorSuggest(new InlineCalc(this));
	}
}
