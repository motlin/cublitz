import {expect, test} from "@playwright/test";
import {atLevel} from "./harness/page.ts";
import {withSession} from "./harness/session.ts";

// Sessions only ever look at the page once it settles, so the harness runs the animation clock fast to keep long scripts quick.
test("a session plays a 170ms roll animation in a fraction of its duration", async ({browser}) =>
{
	await withSession(
		browser,
		{
			storage: atLevel(0),
		},
		async (session) =>
		{
			await session.click("#titlePlay");
			const elapsed = await session.page.evaluate(async () =>
			{
				const el = document.body.appendChild(document.createElement("div"));
				const start = performance.now();
				await el.animate(
					[
						{
							opacity: 0,
						},
						{
							opacity: 1,
						},
					],
					{
						duration: 170,
					},
				).finished;
				el.remove();
				return performance.now() - start;
			});
			expect(elapsed).toBeLessThan(85);
		},
	);
});
