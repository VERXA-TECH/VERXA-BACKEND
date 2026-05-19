import { Router, Request, Response, NextFunction } from "express";
import fs from "fs/promises";
import path from "path";
import envConfig from "../config/env";
import logger from "../config/logger";
import EmailService from "../services/email/email.service";

const router = Router();
const emailService = new EmailService();
const templatesDir = path.join(process.cwd(), "static", "emails");
const fixturesDir = path.join(templatesDir, "fixtures");

function basicAuthIfEnabled(req: Request, res: Response, next: NextFunction) {
    const user = process.env.DEV_PREVIEW_USER;
    const pass = process.env.DEV_PREVIEW_PASS;
    if (!user || !pass) {
        return res.status(500).json({ error: "Email preview auth not configured" });
    }

    const hdr = req.headers.authorization || "";
    const [scheme, encoded] = hdr.split(" ");
    if (scheme !== "Basic" || !encoded) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Email Preview"');
        return res.status(401).send("Authentication required");
    }

    try {
        const decoded = Buffer.from(encoded, "base64").toString("utf8");
        const [u, p] = decoded.split(":");
        if (u === user && p === pass) return next();
    } catch (err) {
        logger.error("Email preview auth error", err);
    }

    res.setHeader("WWW-Authenticate", 'Basic realm="Email Preview"');
    return res.status(401).send("Invalid credentials");
}

router.use((req, res, next) => {
    if (envConfig.env === "production") {
        return res.status(403).json({ error: "Email preview is disabled in production" });
    }
    next();
});

router.use(basicAuthIfEnabled);

router.get("/emails", async (_req: Request, res: Response) => {
    try {
        const items = await fs.readdir(templatesDir);
        const templates = items.filter((f) => f.endsWith(".hbs")).map((f) => f.replace(/\.hbs$/, ""));

        const listHtml = [
            "<html><head><title>Email Templates</title>",
            "<style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:24px} a{color:#1565c0;text-decoration:none} li{margin:8px 0}</style>",
            "</head><body>",
            "<h1>Available Email Templates</h1>",
            "<ul>",
            ...templates.map((t) => `<li><a href="/dev/emails/${t}">${t}</a></li>`),
            "</ul>",
            "<p>Override context: add ?ctx=BASE64(JSON). Toggle CSS inlining: ?inline=false</p>",
            "</body></html>"
        ].join("");

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(listHtml);
    } catch (err) {
        logger.error("Failed to list templates", err);
        return res.status(500).json({ error: "Failed to list templates" });
    }
});

function parseCtxParam(q?: string | string[]): any | undefined {
    if (!q || Array.isArray(q)) return undefined;
    try {
        const jsonStr = Buffer.from(q, "base64").toString("utf8");
        return JSON.parse(jsonStr);
    } catch {
        return undefined;
    }
}

async function tryLoadFixture(name: string): Promise<any | undefined> {
    try {
        const p = path.join(fixturesDir, `${name}.json`);
        const data = await fs.readFile(p, "utf8");
        return JSON.parse(data);
    } catch {
        return undefined;
    }
}

router.get("/emails/:name", async (req: Request, res: Response) => {
    const name = req.params.name;
    const inline = (req.query.inline as string | undefined) !== "false"; // default true

    try {
        const templatePath = path.join(templatesDir, `${name}.hbs`);
        await fs.access(templatePath);
    } catch {
        return res.status(404).send(`Template not found: ${name}`);
    }

    let ctx = parseCtxParam(req.query.ctx as any);
    if (!ctx) {
        ctx = await tryLoadFixture(name);
    }

    try {
        const origin = `${req.protocol}://${req.get("host")}`;
        const html = await emailService.renderTemplate(name, ctx || {}, {
            inlineCss: inline,
            absoluteAssetUrls: true,
            baseUrl: origin
        });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(html);
    } catch (err: any) {
        const msg = err?.message || String(err);
        logger.error(`Failed to render template ${name}:`, err);
        return res.status(400).send(`Failed to render template ${name}: ${msg}`);
    }
});

router.post("/emails/:name", async (req: Request, res: Response) => {
    const template = req.params.name;
    const { to, subject, context } = req.body;

    try {
        const ctx = await tryLoadFixture(template);
        const done = await emailService.sendEmail({
            to,
            subject,
            context: { ...ctx, ...context },
            template
        });
        if (!done) {
            return res.status(500).json({ error: "Failed to send email" });
        }

        return res.status(200).json({ message: "Email sent successfully" });
    } catch (error) {
        logger.error(`Failed to send email`, error);
        return res.status(500).json({ error: "Something went wrong! Please try again" });
    }
});

export default router;
