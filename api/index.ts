import { pagePool } from "../browser/pagepool";
import { parsePage } from "../parser/parser";
import PagePool from "../browser/pagepool";

/** not used */
//import puppeteer from "../../browser/puppeteer";

const { PAGE_COUNT = "1" } = process.env;
let chrome: any = {};
let puppeteer: any;

if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
  chrome = require("chrome-aws-lambda");
  puppeteer = require("puppeteer-core");
} 
else {
  puppeteer = require("puppeteer");
}

export default async function handler(request: any, reply: any) {  
  const options = {
		...request.query,
		...request.body,
	};

	let optionsLaunch = {};
  if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    optionsLaunch = {
			/** Agregado --lang="en-US" */
			args: [...chrome.args, '--lang="en-US"', "--hide-scrollbars", "--disable-web-security"],
      defaultViewport: chrome.defaultViewport,
      executablePath: await chrome.executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    };
  }
	else {
		optionsLaunch = {
			ignoreHTTPSErrors: true,
			headless: true,
			/** Agregado --lang="en-US" */
			args: ['--lang="en-US"', '--no-sandbox', '--disable-setuid-sandbox']
    };		
	}

  console.log(`connecting...`);
	let browser
	try { 
		browser = await puppeteer.launch(optionsLaunch);
	}
	catch (err) {
		console.log("Could not connect to server")
		console.log(err)
		process.exit()
	}

	console.log("connected");
	console.log("initializing pages...");
	await new PagePool(browser, parseInt(PAGE_COUNT, 10)).init();

	console.log("ready");

  const page = pagePool.getPage();
	if (!page) {
		reply
			.status(400)
			.json({
				error: 1,
				message:
					"We're running out of resources. Please wait for a moment and retry.",
			});
		return;
	}

	const { text, from = "auto", to = "zh-CN", lite = false } = options;

	let response: Record<string, any>;
	try {
		const res = await parsePage(page, { text, from, to, lite });
		response = {
			result: res.result,
			pronunciation: res.pronunciation,
			from: {
				// iso: res.fromISO,
				pronunciation: res.fromPronunciation,
				didYouMean: res.fromDidYouMean,
				suggestions: res.fromSuggestions,
			},
			definitions: res.definitions,
			examples: res.examples,
			translations: res.translations,
		};

		Object.keys(response).forEach((key) => {
			if (
				response[key] === undefined ||
				(typeof response[key] === "object" &&
					Object.keys(response[key]).length === 0) ||
				(Array.isArray(response[key]) && response[key].length === 0)
			)
				delete response[key];
		});

		reply.send(response);
	} catch (e) {
		throw e;
	} finally {
		pagePool.releasePage(page);
	}
}
