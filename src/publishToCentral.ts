// deno-lint-ignore-file no-explicit-any
const DEFAULT_API_URL = 'https://api.strem.io';

export async function publishToCentral(addonURL: string, apiURL?: string): Promise<any> {
    const publishURL = (apiURL || DEFAULT_API_URL) + '/api/addonPublish';
    
    try {
        const response = await fetch(publishURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                transportUrl: addonURL, 
                transportName: 'http' 
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const resp = await response.json();
        
        if (resp.error) {
            throw new Error(resp.error);
        }

        return resp.result;
    } catch (error) {
        console.error('Failed to publish addon:', error);
        throw error;
    }
}