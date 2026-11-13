// Unit tests for the pure logic: grading, streaks, chapters, batching, answer checking, speech splitting.
// Run with: npm run test:unit
import { gradeAnswer, normalizeAnswer } from "@/lib/grade";
import { computeStreaks, dayKey, lastNDays, scoreSeries, topicAccuracy } from "@/lib/stats";
import { detectChapters, planBatches, sectionsFromPages, sectionsFromText, splitCount, squash } from "@/lib/sections";
import { cleanExplain, cleanQuestions, ModelOutputError, newFactsIn } from "@/lib/validate";
import { splitForSpeech } from "@/lib/speech";
import { greetingFor, groupByDate, monthGrid, monthlyTotals, progressPct, smoothPath, studyDays } from "@/lib/dashboard";
import { spawnSync } from "node:child_process";
import type { Attempt, GenerateRequest, Section } from "@/lib/types";

let pass = 0, fail = 0;
const t = (name: string, cond: boolean, extra = "") => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name} ${extra}`); } };
const throws = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

console.log("grading typed answers");
const ok = (g: string, a: string, alt: string[] = []) => gradeAnswer(g, a, alt).correct;
t("exact", ok("firewall", "firewall"));
t("case and spaces", ok("  FireWall ", "firewall"));
t("leading article: 'a firewall' for 'firewall'", ok("a firewall", "firewall"));
t("answer has article, student does not", ok("firewall", "The firewall"));
t("plural", ok("firewalls", "firewall"));
t("plural of -y", ok("policies", "policy"));
t("punctuation and accents", ok("Café!", "cafe"));
t("typo in a long word", ok("encrpytion", "encryption"));
t("one missing letter in a long word", ok("authentcation", "authentication"));
t("one harmless extra word", ok("network firewall", "firewall"));
t("word order for multi-word terms", ok("protocol control transmission", "transmission control protocol") === true);
t("alternate answer accepted", ok("TCP", "Transmission Control Protocol", ["TCP"]));
t("ampersand", ok("research and development", "R&D") === false); // abbreviations need the alternates list
t("different short word rejected (tcp vs udp)", !ok("udp", "tcp"));
t("look-alike short words rejected (port vs post)", !ok("post", "port"));
t("look-alike words rejected (layer vs later)", !ok("later", "layer"));
t("different number rejected", !ok("10", "12"));
t("same number accepted", ok("12", "12"));
t("number inside text must match", !ok("version 3", "version 2"));
t("negation flips meaning", !ok("not secure", "secure"));
t("missing word rejected", !ok("transmission control", "transmission control protocol"));
t("two extra words rejected", !ok("a big old network firewall", "firewall"));
t("empty rejected", !ok("", "firewall") && !ok("   ", "firewall"));
t("normalizeAnswer strips article", normalizeAnswer("The Network") === "network");

console.log("streaks and stats");
const d = (s: string) => { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd, 15); };
t("dayKey is local date", dayKey(d("2026-11-09")) === "2026-11-09");
let s = computeStreaks(["2026-11-07", "2026-11-08", "2026-11-09"], d("2026-11-09"));
t("3-day streak including today", s.current === 3 && s.longest === 3 && s.totalDays === 3);
s = computeStreaks(["2026-11-07", "2026-11-08"], d("2026-11-09"));
t("streak is still alive if you studied yesterday", s.current === 2);
s = computeStreaks(["2026-11-05", "2026-11-06"], d("2026-11-09"));
t("streak is 0 after missing a day, longest remembered", s.current === 0 && s.longest === 2);
s = computeStreaks(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-03", "2026-11-04"], d("2026-11-04"));
t("a gap splits streaks (month change works)", s.current === 2 && s.longest === 3);
s = computeStreaks(["2026-11-09", "2026-11-09"], d("2026-11-09"));
t("same day twice counts once", s.current === 1 && s.totalDays === 1);
t("empty history", computeStreaks([], d("2026-11-09")).current === 0);
t("daylight saving change does not break a streak", computeStreaks(["2026-03-07", "2026-03-08", "2026-03-09"], d("2026-03-09")).current === 3);
const strip = lastNDays(["2026-11-09", "2026-11-07"], 4, d("2026-11-09"));
t("last 4 days strip", strip.map((x) => x.active).join() === "false,true,false,true" && strip[3].key === "2026-11-09");
const att = (id: string, at: string, c: number, n: number, mode?: "exam", topics: [string, boolean][] = []): Attempt => ({ id, at, total: n, correct: c, mode, answers: topics.map(([topic, correct], i) => ({ questionId: `${id}${i}`, given: "x", correct, topic })) });
const sets = [{ title: "A", attempts: [att("a2", "2026-11-02T10:00:00Z", 8, 10, "exam", [["Net", true], ["Net", true], ["Crypto", false]]), att("a1", "2026-11-01T10:00:00Z", 5, 10, undefined, [["Net", true], ["Crypto", false], ["Crypto", false]])] }];
const series = scoreSeries(sets);
t("scores sorted by date with percent and mode", series.length === 2 && series[0].pct === 50 && series[1].pct === 80 && series[1].mode === "exam" && series[0].mode === "practice");
const topics = topicAccuracy(sets, 2);
t("weakest topic first", topics[0].topic === "Crypto" && topics[0].pct === 0 && topics[1].topic === "Net" && topics[1].pct === 100);

console.log("chapters, sections and batches");
const pages = Array.from({ length: 12 }, (_, i) => `${i === 0 ? "Module 1: Networks\n" : i === 5 ? "Module 2: Security\n" : i === 9 ? "Module 3: Privacy\n" : ""}Content of page ${i + 1} with enough words to count as text here.`);
const secs = sectionsFromPages(pages);
t("pages become sections with real page numbers", secs.length === 12 && secs[3].label === "Page 4");
const ch = detectChapters(secs);
t("3 chapters detected from headings", ch.length === 3 && ch[0].title === "Module 1: Networks" && ch[1].from === 5 && ch[2].to === 11 && ch[0].to === 4);
const repeated = sectionsFromPages(Array.from({ length: 6 }, (_, i) => `Module 1 Network Security\nPage body number ${i + 1} has plenty of words in it for the test.`));
t("a running header repeated on every page is not many chapters", detectChapters(repeated).length === 1);
const noChap = sectionsFromPages(Array.from({ length: 25 }, (_, i) => `Plain page ${i + 1} text with plenty of words so it is kept by the reader.`));
const blocks = detectChapters(noChap);
t("no chapter headings: falls back to blocks of 10", blocks.length === 3 && blocks[0].title === "Page 1 to Page 10" && blocks[2].to === 24);
t("text without headings gives sections", sectionsFromText("Hello world.\n\nSecond paragraph here.").length >= 1);
const big = sectionsFromPages(Array.from({ length: 40 }, (_, i) => `Page ${i} ${"word ".repeat(500)}`));
const batches = planBatches(big, 10);
t("batches cover every section once, in order", batches.reduce((n, b) => n + b.sections.length, 0) === 40 && batches.flatMap((b) => b.sections.map((x) => x.id)).join() === big.map((x) => x.id).join());
t("batches are small enough", batches.every((b) => b.chars <= 16_000), String(batches.map((b) => b.chars)));
t("count split adds up exactly", splitCount(25, batches).reduce((a, b) => a + b, 0) === 25 && splitCount(3, batches).reduce((a, b) => a + b, 0) === 3);
t("squash ignores case, spaces, punctuation", squash("Hello,  World!") === squash("hello world"));

console.log("validation: alternates and 'explain simpler'");
const section: Section = { id: "s1", label: "Page 1", text: "A firewall is a network security device. TCP stands for Transmission Control Protocol and it was designed in 1974 by Vint Cerf." };
const req: GenerateRequest = { kind: "quiz", sections: [section], count: 5 };
const good = { type: "identification", question: "What does TCP stand for?", answer: "Transmission Control Protocol", alternates: ["TCP", "Not in the text", "Transmission Control Protocol"], explanation: "It is in the text.", topic: "Net", sourceId: "s1", evidence: "TCP stands for Transmission Control Protocol and it was designed in 1974" };
const cleaned = cleanQuestions({ questions: [good] }, req).items[0];
t("alternates kept only when they appear in the material", JSON.stringify(cleaned.alternates) === JSON.stringify(["TCP"]), JSON.stringify(cleaned.alternates));
t("fabricated evidence rejected", throws(() => cleanQuestions({ questions: [{ ...good, evidence: "Penguins live in the desert and build large igloos" }] }, req)));
t("unknown source id rejected", throws(() => cleanQuestions({ questions: [{ ...good, sourceId: "s9" }] }, req)));
t("multiple choice must contain the answer", throws(() => cleanQuestions({ questions: [{ ...good, type: "multiple_choice", choices: ["a", "b", "c", "d"], answer: "z" }] }, req)));
t("newFactsIn: clean rewording passes", newFactsIn("A firewall is a security device for a network.", section.text).length === 0);
t("newFactsIn: new number caught", newFactsIn("It was made in 1987.", section.text).join() === "1987");
t("newFactsIn: number from the material allowed", newFactsIn("It was designed in 1974.", section.text).length === 0);
t("newFactsIn: new name caught", newFactsIn("It was made by Einstein, a famous scientist.", section.text).includes("Einstein"));
t("newFactsIn: name from the material allowed", newFactsIn("It was designed by Vint Cerf.", section.text).length === 0);
t("newFactsIn: sentence-start words ignored", newFactsIn("Think of it as a guard. Every packet is checked.", section.text).length === 0);
const exp = cleanExplain({ simple: "A firewall guards a network.", sourceId: "s1", evidence: "A firewall is a network security device" }, { text: "A firewall is a network security device.", section });
t("explain: valid answer accepted", exp.simple.startsWith("A firewall"));
t("explain: bad quote rejected", throws(() => cleanExplain({ simple: "x y z", sourceId: "s1", evidence: "totally made up words that are not there" }, { text: "t", section })));
t("explain: new number rejected", (() => { try { cleanExplain({ simple: "It started in 1999.", sourceId: "s1", evidence: "A firewall is a network security device" }, { text: "t", section }); return false; } catch (e) { return e instanceof ModelOutputError; } })());

console.log("read aloud text splitting");
const parts = splitForSpeech("First sentence here. Second one is a bit longer than the first one is. " + "Third ".repeat(60) + ".");
t("long text is cut into small pieces", parts.length >= 3 && parts.every((p) => p.length <= 190), String(parts.map((p) => p.length)));
t("empty text gives nothing", splitForSpeech("   ").length === 0);

console.log("dashboard helpers");
const nowD = new Date(2026, 10, 11, 15, 0); // 11 Nov 2026, 3 pm
const at = (daysAgo: number, h = 10) => new Date(2026, 10, 11 - daysAgo, h).toISOString();
const groups = groupByDate([{ id: "a", updatedAt: at(0) }, { id: "b", updatedAt: at(1) }, { id: "c", updatedAt: at(3) }, { id: "d", updatedAt: at(7) }, { id: "e", updatedAt: at(8) }, { id: "f", updatedAt: at(40) }, { id: "g", updatedAt: at(0, 14) }], nowD);
t("chat list groups: Today, Yesterday, Previous 7 days, Older", groups.map((g) => g.label).join() === "Today,Yesterday,Previous 7 days,Older");
t("chat list: newest first inside Today", groups[0].items.map((x) => x.id).join() === "g,a");
t("chat list: day 7 is 'Previous 7 days', day 8 is 'Older'", groups[2].items.map((x) => x.id).join() === "c,d" && groups[3].items.map((x) => x.id).join() === "e,f");
t("chat list: empty groups are left out", groupByDate([{ id: "a", updatedAt: at(0) }], nowD).length === 1);
t("chat list: just after midnight is still 'Today'", groupByDate([{ id: "a", updatedAt: new Date(2026, 10, 11, 0, 5).toISOString() }], new Date(2026, 10, 11, 23, 55))[0].label === "Today");
const nov = monthGrid(2026, 10); // Nov 2026 starts on a Sunday
t("calendar: November 2026 starts on Sunday, 5 weeks", nov.length === 5 && nov[0][0] === 1 && nov[4][1] === 30 && nov[4][2] === null);
const feb = monthGrid(2028, 1); // leap year, starts on Tuesday
t("calendar: leap-year February has 29 days, starts on Tuesday", feb.flat().filter(Boolean).length === 29 && feb[0][2] === 1 && feb[0][0] === null);
const days = studyDays(["2026-11-01"], [{ attempts: [att("x", at(2), 1, 2), att("y", "2026-11-01T08:00:00Z", 1, 2)] }]);
t("study days merge saved days and quiz days without duplicates", days.length === 2 && days.includes("2026-11-09"), days.join());
const monthly = monthlyTotals([{ attempts: [att("x", new Date(2026, 10, 3).toISOString(), 3, 10), att("y", new Date(2026, 9, 20).toISOString(), 1, 5), att("z", new Date(2025, 0, 1).toISOString(), 1, 99)] }], nowD, 12);
t("activity chart: 12 months, oldest first, sums questions, ignores older data", monthly.length === 12 && monthly[11].key === "2026-11" && monthly[11].value === 10 && monthly[10].value === 5 && monthly.every((m) => m.value <= 10));
const path = smoothPath([{ x: 0, y: 100 }, { x: 10, y: 100 }, { x: 20, y: 100 }, { x: 30, y: 10 }]);
const ys = [...path.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
t("smooth curve never dips below the lowest point (no swing past zero)", ys.every((y) => y <= 100 && y >= 10), String(ys));
t("daily goal percent", progressPct(5, 10) === 50 && progressPct(0, 10) === 0 && progressPct(25, 10) === 100 && progressPct(3, 0) === 0);
t("greeting by hour", greetingFor(new Date(2026, 0, 1, 8)) === "Good morning" && greetingFor(new Date(2026, 0, 1, 13)) === "Good afternoon" && greetingFor(new Date(2026, 0, 1, 20)) === "Good evening");

console.log("build guard: a secret key must never be exposed as the publishable key");
const guard = (key: string) => spawnSync("npx", ["tsx", "-e", "import('./next.config.ts').then(()=>console.log('LOADED'))"], { env: { ...process.env, SUPABASE_PUBLISHABLE_KEY: key }, encoding: "utf8" });
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;
t("sb_secret_ key is refused", /SECRET key/.test(guard("sb_secret_abc").stderr));
t("service_role JWT key is refused", /SECRET key/.test(guard(jwt("service_role")).stderr));
t("publishable key is accepted", guard("sb_publishable_abc").stdout.includes("LOADED"));
t("old anon JWT key is accepted", guard(jwt("anon")).stdout.includes("LOADED"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
