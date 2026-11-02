import {parseAst} from "vite";

// The original is one classic script, so its top-level names are the page's global scope: function
// declarations land on window, const and let become global lexical bindings. The bundler flattens the
// modules into vars and adds helpers the original never had. This puts the scope back: only the original's
// names stay global, each of the original's kind, and everything else moves into a private function.

export type TopLevelKind = "let" | "const" | "function";

type Span =
{
	start: number;
	end: number;
};
type Declarator =
{
	id: Span &
	{
		name: string;
	};
	init: Span | null;
};
// The parser's shape for what these scripts hold at the top level: every binding there is a plain name.
type Statement =
	| (Span &
	  {
			type: "FunctionDeclaration";
			id:
			{
				name: string;
			};
	  })
	| (Span &
	  {
			type: "VariableDeclaration";
			kind: string;
			declarations: Declarator[];
	  })
	| (Span &
	  {
			type: "OtherStatement";
	  });

const parse = (script: string): Statement[] =>
	(
		parseAst(
			script,
			{
				sourceType: "script",
			},
		) as unknown as
		{
			body: Statement[];
		}
	).body;

export function topLevelNames(script: string): Map<string, TopLevelKind>
{
	const names = new Map<string, TopLevelKind>();
	for (const statement of parse(script))
	{
		if (statement.type === "FunctionDeclaration") names.set(statement.id.name, "function");
		else if (statement.type === "VariableDeclaration")
		{
			for (const {id} of statement.declarations) names.set(id.name, statement.kind as TopLevelKind);
		}
	}
	return names;
}

export function keepOriginalGlobalScope(bundle: string, original: Map<string, TopLevelKind>): string
{
	const statements = parse(bundle);
	const lets = [...original].filter(([, kind]) => kind === "let").map(([name]) => name);
	const consts = [...original].filter(([, kind]) => kind === "const").map(([name]) => name);

	const functions = new Map<string, string>();
	const privateFunctions: string[] = [];
	const vars = new Set<string>();
	const rest: string[] = [];
	let from = 0;
	const skipTo = (statement: Statement, replacement: string): void =>
	{
		rest.push(bundle.slice(from, statement.start), replacement);
		from = statement.end;
	};
	for (const statement of statements)
	{
		if (statement.type === "FunctionDeclaration")
		{
			const text = bundle.slice(statement.start, statement.end);
			if (original.get(statement.id.name) === "function") functions.set(statement.id.name, text);
			else privateFunctions.push(text);
			skipTo(statement, "");
		}
		else if (statement.type === "VariableDeclaration")
		{
			if (statement.kind !== "var")
				throw new Error(
					`Expected the bundler to write vars, got: ${bundle.slice(statement.start, statement.end)}`,
				);
			const parts = statement.declarations.map(({id, init}) =>
			{
				const {name} = id;
				vars.add(name);
				if (original.get(name) !== "let") return `var ${bundle.slice(id.start, init?.end ?? id.end)};`;
				return init ? `${name} = ${bundle.slice(init.start, init.end)};` : "";
			});
			skipTo(statement, parts.join("\n"));
		}
	}
	rest.push(bundle.slice(from));

	const missing = [...original].filter(([name, kind]) =>
		kind === "function" ? !functions.has(name) : !vars.has(name),
	);
	if (missing.length > 0)
		throw new Error(
			`The bundle's top level must hold: ${missing.map(([name, kind]) => `${name} (${kind})`).join(", ")}`,
		);

	const exposed = [...original.keys()]
		.filter((name) => functions.has(name))
		.map(
			(name) =>
				`Object.defineProperty(window, ${JSON.stringify(name)}, {value: ${functions.get(name)}, writable: true, enumerable: true});`,
		);
	const failed = "$$scriptFailed";
	const failure = "$$scriptFailure";
	// An empty pattern binds no name, so reading its key runs last, after every const has its value. That is
	// where an error from the script surfaces, leaving the page's names readable as the original's would be.
	return [
		...(lets.length > 0 ? [`let ${lets.join(", ")};`] : []),
		`const {${[...consts, '"": {}'].join(", ")}} = (() => {`,
		...exposed,
		...privateFunctions,
		`var ${failed} = false, ${failure};`,
		"try {",
		rest.join(""),
		`} catch ($$error) { ${failed} = true; ${failure} = $$error; }`,
		`return {${[...consts, `get ""() { if (${failed}) throw ${failure}; return {}; }`].join(", ")}};`,
		"})();",
		"",
	].join("\n");
}
