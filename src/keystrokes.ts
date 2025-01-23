import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

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
    keystrokes: number; // Latest report of number of keystrokes in the last interval
	average30m: number; // Average keystrokes per second over the last 30 minutes
    reportingRate: number; // How often to report, reports per second. 
    instanceId: string; // Unique identifier for the instance
    fileStats: Record<string, FileKeystrokeStats>; // Keystroke statistics per file
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
    private readonly reportingUrl: string;
    private readonly containerID: string;
    private readonly reportRate: number;
    private readonly debug: boolean;
    private keystrokeSubscription: vscode.Disposable | undefined;
 
    constructor() {
        this.instanceId = generateId();
        this.reportingUrl = process.env.KST_REPORTING_URL || '';
        this.containerID = process.env.KST_CONTAINER_ID || 'unknown';
        this.reportRate = parseInt(process.env.KST_REPORT_RATE || '30', 10);
        this.debug = process.env.KST_DEBUG === 'true' || false;
    
        if (!this.reportingUrl) {
            throw new Error('REPORTING_URL environment variable is not set');
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

    private async reportMetrics() {
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
            instanceId: this.instanceId,
            keystrokes: this.totalKeystrokes,
            average30m: this.average30m,
            reportingRate: this.reportRate,
            fileStats: fileStats
        };

        try {
            await this.sendHttpRequest(data);
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
        } finally {
            // Reset total keystroke counter but keep per-file stats
            this.totalKeystrokes = 0;
        }
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

    private async sendHttpRequest(data: KeystrokeData): Promise<void> {
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
}


export function activateKeyRate(context: vscode.ExtensionContext) {
    try {
        const monitor = new KeystrokeMonitor();
        
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