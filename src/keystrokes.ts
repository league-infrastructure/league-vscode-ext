import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

interface KeystrokeData {
    timestamp: string;
    containerID: string;
    keystrokesPerSecond: number;
    reportingRate: number;
}



export class KeystrokeMonitor {
    private keystrokes: number = 0;
    private interval: NodeJS.Timeout | undefined;
    private readonly reportingUrl: string;
    private readonly containerID: string;
    private readonly reportRate: number;
	private readonly debug: boolean;
	private keystrokeSubscription: vscode.Disposable | undefined;
 
    constructor() {
        // Get environment variables
        this.reportingUrl = process.env.KST_REPORTING_URL || '';
        this.containerID = process.env.KST_CONTAINER_ID || 'unknown';
        this.reportRate = parseInt(process.env.KST_REPORT_RATE || '30', 10);
		this.debug = process.env.KST_DEBUG === 'true' || false;
    
        if (!this.reportingUrl) {
            throw new Error('REPORTING_URL environment variable is not set');
        }

		console.log('Keystroke monitor initialized with params: ', { reportingUrl: this.reportingUrl, containerID: this.containerID, reportRate: this.reportRate });	
    }

    public start() {
        // Store the subscription
        this.keystrokeSubscription = vscode.workspace.onDidChangeTextDocument(
            this.handleKeystroke.bind(this)
        );
        
		// Start reporting interval
		this.interval = setInterval(() => {
			void this.reportMetrics();  // void operator handles the promise
		}, 1000 * this.reportRate);
		
		if (this.debug) {
			console.log(`Reporting interval set to ${this.reportRate} seconds`);
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

    private handleKeystroke() {
        this.keystrokes++;
    }

    private async reportMetrics() {
        const data: KeystrokeData = {
            timestamp: new Date().toISOString(),
            containerID: this.containerID,
            keystrokesPerSecond: this.keystrokes,
            reportingRate: this.reportRate
        };

        try {
            await this.sendHttpRequest(data);
        } catch (error) {
            if (error instanceof AggregateError) {
				for (const err of error.errors) {
					if (err.code === 'ECONNREFUSED') {
					// Should not happen, but not a big deal. 
					if (this.debug) {
						console.error('Connection refused. Is the telemetry server running?');
					}
					} else if (err.code === 'ETIMEDOUT') {
						// We expect this, since the demo telemetry server returns nothing
					if (this.debug) {
						console.error('Connection timed out. Is the telemetry server running?');
						}
					}
				}

			}
    	} finally {

        	// Reset counter for next interval
        	this.keystrokes = 0;
		}
	}

    private async sendHttpRequest(data: KeystrokeData, retryCount = 3): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = new URL(this.reportingUrl);
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                timeout: 5000, // 5 second timeout
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

            req.on('error', async (error) => {
				
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