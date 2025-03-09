/* Keystroke telemetry for tracking student activity*/
import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import * as crypto from 'crypto';

function generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

interface KeystrokeData {
    timestamp: string;
    containerID: string;
    serviceID: string;
    serviceName: string;
    keystrokes: number; // Latest report of number of keystrokes in the last interval
	average30m: number; // Average keystrokes per second over the last 30 minutes
    reportingRate: number; // How often to report, reports per second. 
    instanceId: string; // Unique identifier for the instance
    fileStats: Record<string, FileKeystrokeStats>; // Keystroke statistics per file
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



interface FileKeystrokeStats {
    keystrokes: number;
    lastModified: string;
}

export class KeystrokeMonitor {
    private readonly instanceId: string;
    private totalKeystrokes: number = 0;
    private fileKeystrokes: Map<string, FileKeystrokeStats> = new Map();
    private interval: NodeJS.Timeout | undefined;
    private average30m: number = 0;
    private nReports: number = 0;
    private readonly reportDir: string;
    private readonly reportingUrl: string;
    private readonly containerID: string;
    private readonly serviceID: string;
    private readonly serviceName: string;
    private readonly reportRate: number;
    private readonly debug: boolean;
    private keystrokeSubscription: vscode.Disposable | undefined;
    private lastReport: KeystrokeData | undefined;
 
    constructor(context: vscode.ExtensionContext) {
        
        this.instanceId = generateId();
        this.reportDir = process.env.KST_REPORT_DIR || vscode.extensions.getExtension(context.extension.id)?.extensionPath || '';
        this.reportingUrl = process.env.KST_REPORTING_URL || '';
        this.containerID = process.env.KST_CONTAINER_ID || 'unknown';
        this.serviceID = process.env.KST_SERVICE_ID || 'unknown';
        this.serviceName = process.env.KST_SERVICE_NAME || 'unknown';
        this.reportRate = parseInt(process.env.KST_REPORT_RATE || '30', 10);
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
            { reportingUrl: this.reportingUrl, containerID: this.containerID, reportRate: this.reportRate, instanceId: this.instanceId });
    }

    public start() {
        this.keystrokeSubscription = vscode.workspace.onDidChangeTextDocument(
            this.handleKeystroke.bind(this)
        );
        
        this.interval = setInterval(() => {
            void this.reportMetrics();
        }, 1000 * this.reportRate);
        
        if (this.debug) {
            console.log(`Reporting interval set to ${this.reportRate} seconds`);
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

    private makeKeyStrokeData(): KeystrokeData {

        const reportingIntervalsIn30Minutes = (30 * 60) / this.reportRate;
        const queueSize = Math.min(++this.nReports, reportingIntervalsIn30Minutes);
        const currentKPS = this.totalKeystrokes / this.reportRate;
        this.average30m = ((this.average30m * (queueSize - 1)) + currentKPS) / queueSize;

        // Convert Map to plain object for JSON serialization
        const fileStats: Record<string, FileKeystrokeStats> = {};
        this.fileKeystrokes.forEach((stats, path) => {
            fileStats[path] = stats;
        });

        const data: KeystrokeData = {
            timestamp: new Date().toISOString(),
            containerID: this.containerID,
            serviceID: this.containerID,
            serviceName: this.serviceName,
            instanceId: this.instanceId,
            keystrokes: this.totalKeystrokes,
            average30m: this.average30m,
            reportingRate: this.reportRate,
            fileStats: fileStats
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
        let lastPath =  fileBase + '/last.json'

        // If the data is the same as the last report, write to the last.json file, so 
        // we still get a record of the last report even if it's the same as the current one, 
        // but we don't clog up the directory. 
        if (this.lastReport && hashKeystrokeData(data) === hashKeystrokeData(this.lastReport)) {
            filePath = lastPath;
        }  else {
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

export function activateKeyRate(context: vscode.ExtensionContext) {
    try {



        const monitor = new KeystrokeMonitor(context);
        
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

export function deactivate() {}