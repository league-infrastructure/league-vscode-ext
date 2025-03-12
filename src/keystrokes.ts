/* Keystroke telemetry for tracking student activity*/
import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import * as crypto from 'crypto';
import { SyllabusProvider } from './SyllabusProvider';

function generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

interface FileKeystrokeStats {
    keystrokes: number;
    lastModified: string;
}

interface KeystrokeData {
    timestamp: string;
    username: string;
    class_id: string; // The class ID
    image: string; // The image name
    repo: string; // The repository name
    syllabus: string; // The syllabus name
    keystrokes: number; // Latest report of number of keystrokes in the last interval
    average30m: number; // Average keystrokes per second over the last 30 minutes
    average5m: number; // Average keystrokes per second over the last 5 minutes
    memory: number; // Memory usage in MB
    reportingRate: number; // How often to report, reports per second. 
    instanceId: string; // Unique identifier for the instance
    fileStats: Record<string, FileKeystrokeStats>; // Keystroke statistics per file
    completions: number[]; // Lesson Completions
}

function hashKeystrokeData(data: KeystrokeData): string {
    const hash = crypto.createHash('sha256');

    // Exclude the timestamp property from the hash calculation
    const { timestamp, ...dataWithoutTimestamp } = data;

    // Convert the object to a JSON string and update the hash
    hash.update(JSON.stringify(dataWithoutTimestamp));

    // Return the hash value as a hexadecimal string
    return hash.digest('hex');
}

export class KeystrokeMonitor {
    private readonly instanceId: string;
    private totalKeystrokes: number = 0;
    private fileKeystrokes: Map<string, FileKeystrokeStats> = new Map();
    private interval: NodeJS.Timeout | undefined;
    private average30m: number = 0;
    private average5m: number = 0;
    private nReports: number = 0;
    private readonly reportDir: string;
    private readonly reportingUrl: string;
    private readonly reportInterval: number;
    private readonly debug: boolean;
    private keystrokeSubscription: vscode.Disposable | undefined;
    private lastReport: KeystrokeData | undefined;

    constructor(context: vscode.ExtensionContext, private syllabusProvider: SyllabusProvider) {

        this.instanceId = generateId();
        this.reportDir = process.env.KST_REPORT_DIR || vscode.extensions.getExtension(context.extension.id)?.extensionPath || '';
        this.reportingUrl = process.env.KST_REPORTING_URL || '';

        this.reportInterval = parseInt(process.env.KST_REPORT_INTERVAL || '30', 10); // Seconds between reports
        this.debug = process.env.KST_DEBUG === 'true' || false;

        if (this.reportingUrl) {
            console.log(`Keystrokes will be reported to: ${this.reportingUrl}`);
        } else {
            console.log('Keystrokes will not be reported, no reporting URL');
        }

        if (this.reportDir) {
            console.log(`Keystroke reports will be written to: ${this.reportDir}`);
        } else {
            console.log('Keystroke reports will not be written to disk no report dir');
        }

        console.log('Keystroke monitor initialized with params: ',
            { reportingUrl: this.reportingUrl, reportRate: this.reportInterval, instanceId: this.instanceId });
    }

    public start() {
        this.keystrokeSubscription = vscode.workspace.onDidChangeTextDocument(
            this.handleKeystroke.bind(this)
        );

        this.interval = setInterval(() => {
            void this.reportMetrics();
        }, 1000 * this.reportInterval);

        if (this.debug) {
            console.log(`Reporting interval set to ${this.reportInterval} seconds`);
        }
    }

    private handleKeystroke(event: vscode.TextDocumentChangeEvent) {
        // Get the file path
        const filePath = event.document.uri.fsPath;

        // Update total keystrokes
        this.totalKeystrokes++;

        // Update file-specific keystrokes
        const currentStats = this.fileKeystrokes.get(filePath) || {
            keystrokes: 0,
            lastModified: new Date().toISOString()
        };

        // Increment keystroke count for this file
        currentStats.keystrokes++;
        currentStats.lastModified = new Date().toISOString();

        // Update the map
        this.fileKeystrokes.set(filePath, currentStats);

        if (this.debug) {
            console.log(`Keystroke in file: ${filePath}, total for file: ${currentStats.keystrokes}`);
        }
    }

    private async getMemoryUsage(): Promise<number> {
        const memoryUsageFilePath = '/sys/fs/cgroup/memory.current';

        const memoryUsageContent = await vscode.workspace.fs.readFile(vscode.Uri.file(memoryUsageFilePath));
        const memoryUsage = parseInt(memoryUsageContent.toString(), 10); // Convert from bytes to MB
        return memoryUsage;;
    }

    private calcRunningAverage(newData: number, currentAverage: number, averagePeriod: number): number {

        const reportingIntervalsIn30Minutes = averagePeriod * (60 / this.reportInterval);
        const queueSize = Math.min(++this.nReports, reportingIntervalsIn30Minutes);

        return ((currentAverage * (queueSize - 1)) + newData) / queueSize;
    }


    private makeKeyStrokeData(): KeystrokeData {

        const currentKPS = this.totalKeystrokes / this.reportInterval;
        
        this.average30m = this.calcRunningAverage(currentKPS, this.average30m, 30);
        this.average5m = this.calcRunningAverage(currentKPS, this.average5m, 5);

        // Convert Map to plain object for JSON serialization
        const fileStats: Record<string, FileKeystrokeStats> = {};
        this.fileKeystrokes.forEach((stats, path) => {
            fileStats[path] = stats;
        });

        const memoryUsage = this.getMemoryUsage();

        const data: KeystrokeData = {
            timestamp: new Date().toISOString(),
            instanceId: this.instanceId,
            keystrokes: this.totalKeystrokes,
            average30m: this.average30m,
            average5m: this.average5m,
            memory: process.memoryUsage().rss / 1024 / 1024,
            reportingRate: this.reportInterval,
            fileStats: fileStats,
            completions: this.syllabusProvider.getCompletions(),   
            image: process.env.JTL_IMAGE_URI || 'unknown',       
            repo:  process.env.JTL_REPO   || 'unknown',
            syllabus: process.env.JTL_SYLLABUS || 'unknown',
            class_id: process.env.JTL_CLASS_ID || 'unknown',
            username: process.env.JTL_USERNAME || 'unknown'
        };

        return data
    }

    private async reportMetrics() {

        const data = this.makeKeyStrokeData();

        //console.log('Reporting keystrokes:', data);

        this.sendHttpRequest(data);
        this.writeToReportDir(data);
        this.totalKeystrokes = 0;
        this.lastReport = data;

    }

    public stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }

        if (this.keystrokeSubscription) {
            this.keystrokeSubscription.dispose();
            this.keystrokeSubscription = undefined;
        }

        console.log('Keystroke monitor stopped');
    }

    public dispose() {
        this.stop();
    }

    private async _sendHttpRequest(data: KeystrokeData): Promise<void> {

        if (!this.reportingUrl) {
            return
        }


        return new Promise((resolve, reject) => {
            const url = new URL(this.reportingUrl);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(JSON.stringify(data))
                }
            };

            const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP Error: ${res.statusCode} - ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(JSON.stringify(data));
            req.end();
        });
    }


    private async sendHttpRequest(data: KeystrokeData): Promise<void> {
        try {
            await this._sendHttpRequest(data);
        } catch (error) {
            if (error instanceof AggregateError) {
                for (const err of error.errors) {
                    if (err.code === 'ECONNREFUSED' && this.debug) {
                        console.error('Connection refused. Is the telemetry server running?');
                    } else if (err.code === 'ETIMEDOUT' && this.debug) {
                        console.error('Connection timed out. Is the telemetry server running?');
                    }
                }
            }
        }
    }

    private async writeToReportDir(data: KeystrokeData): Promise<void> {

        if (!this.reportDir) {
            return;
        }

        let ts = new Date().toISOString().split('.')[0] + 'Z';

        const fileBase = `${this.reportDir}/keystrokes/${this.instanceId}`;

        let filePath = '';
        let lastPath = fileBase + '/last.json'

        // If the data is the same as the last report, write to the last.json file, so 
        // we still get a record of the last report even if it's the same as the current one, 
        // but we don't clog up the directory. 
        if (this.lastReport && hashKeystrokeData(data) === hashKeystrokeData(this.lastReport)) {
            filePath = lastPath;
        } else {
            filePath = fileBase + `/${ts}.json`;

            // Delete the last.json file if it exists
            try {
                const lastUri = vscode.Uri.file(lastPath);
                const lastFileExists = await vscode.workspace.fs.stat(lastUri).then(() => true, () => false);
                if (lastFileExists) {
                    vscode.workspace.fs.delete(lastUri, { useTrash: false });
                }
            } catch (error) {
                if (this.debug) {
                    console.error('Failed to delete last.json:', error);
                }
            }
        }

        // Write the data to the file
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(JSON.stringify(data, null, 2)));
    }
}

export function activateKeyRate(context: vscode.ExtensionContext, syllabusProvider: SyllabusProvider) {
    try {

        const monitor = new KeystrokeMonitor(context, syllabusProvider);

        // Start monitoring
        monitor.start();

        // Register the monitor for disposal
        context.subscriptions.push(monitor);

        // Log activation
        console.log('Key rate monitor activated');

    } catch (error) {
        if (error instanceof Error) {
            vscode.window.showErrorMessage(`Failed to initialize keystroke monitor: ${error.message}`);
        }
    }
}

export function deactivate() { }