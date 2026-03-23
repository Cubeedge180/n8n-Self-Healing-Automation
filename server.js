const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Gemini API for root cause analysis
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const API_KEY = process.env.BRIDGE_API_KEY;
const MCP_CONFIG = path.join(__dirname, '.mcp.json');
const SKILLS_DIR = path.join(__dirname, 'n8n-skills/skills');
const ERROR_LOG = path.join(SKILLS_DIR, 'n8n-error-memory/error-log.md');
const CLAUDE_MD = path.join(__dirname, 'CLAUDE.md');
const PROJECT_DIR = __dirname;

// n8n API configuration for auto-retry
const N8N_API_URL = process.env.N8N_API_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
    console.warn('[CONFIG] BRIDGE_API_KEY is not set; /fix-workflow will reject all requests.');
}
if (!GEMINI_API_KEY) {
    console.warn('[CONFIG] GEMINI_API_KEY is not set; root cause analysis will be disabled.');
}
if (!N8N_API_URL || !N8N_API_KEY) {
    console.warn('[CONFIG] N8N_API_URL or N8N_API_KEY not set; auto-retry will be disabled.');
}

// AI-powered root cause analysis using Gemini
async function analyzeRootCause(errorMessage, nodeName, workflowName, errorLog) {
    if (!GEMINI_API_KEY) {
        return 'Gemini API key not configured (set GEMINI_API_KEY).';
    }
    return new Promise((resolve) => {
        const prompt = `You are an n8n workflow debugging expert. Analyze this error and provide a concise root cause analysis.

WORKFLOW: ${workflowName}
FAILED NODE: ${nodeName}
ERROR MESSAGE: ${errorMessage}

PAST ERROR PATTERNS (for context):
${errorLog}

Provide your analysis in this exact format:
- ROOT CAUSE: [One sentence explanation of why this error occurred]
- LIKELY FIX: [One sentence on how to fix it]
- PATTERN MATCH: [If this matches a past error pattern, mention it; otherwise say "New error type"]
- CONFIDENCE: [HIGH/MEDIUM/LOW]

Be concise and technical.`;

        const requestBody = JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    // Debug: log if there's an error in the response
                    if (response.error) {
                        console.log('[GEMINI ERROR]', response.error.message || JSON.stringify(response.error));
                        resolve('Gemini API error: ' + (response.error.message || 'Unknown error'));
                        return;
                    }
                    const analysis = response.candidates?.[0]?.content?.parts?.[0]?.text || 'Analysis unavailable';
                    resolve(analysis);
                } catch (e) {
                    console.log('[GEMINI PARSE ERROR] Raw response:', data.substring(0, 500));
                    resolve('Root cause analysis failed: ' + e.message);
                }
            });
        });

        req.on('error', (e) => {
            resolve('Root cause analysis unavailable: ' + e.message);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve('Root cause analysis timed out');
        });

        req.write(requestBody);
        req.end();
    });
}

// Auto-retry workflow after fix
async function retryWorkflow(workflowId, workflowName) {
    if (!N8N_API_URL || !N8N_API_KEY) {
        return { success: false, error: 'N8N API not configured (set N8N_API_URL and N8N_API_KEY).' };
    }
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({});

        const url = new URL(`${N8N_API_URL}/api/v1/workflows/${workflowId}/run`);

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-N8N-API-KEY': N8N_API_KEY,
                'Content-Length': Buffer.byteLength(requestBody)
            }
        };

        console.log(`[AUTO-RETRY] Triggering re-execution of workflow: ${workflowName} (${workflowId})`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`[AUTO-RETRY] Successfully triggered workflow re-execution`);
                    resolve({ success: true, response: data });
                } else {
                    console.log(`[AUTO-RETRY] Failed to trigger workflow: ${res.statusCode} - ${data}`);
                    resolve({ success: false, error: data });
                }
            });
        });

        req.on('error', (e) => {
            console.log(`[AUTO-RETRY] Request error: ${e.message}`);
            resolve({ success: false, error: e.message });
        });

        req.write(requestBody);
        req.end();
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'n8n-claude-bridge'
    });
});

// Main endpoint - n8n calls this when a workflow fails
app.post('/fix-workflow', async (req, res) => {
    // Validate API key
    if (!API_KEY || req.headers['x-api-key'] !== API_KEY) {
        console.log('Unauthorized request - invalid API key');
        return res.status(401).json({ error: 'Invalid API key' });
    }

    const { workflow, execution, trigger } = req.body;

    if (!workflow || !workflow.id) {
        return res.status(400).json({ error: 'Missing workflow data or workflow ID' });
    }

    // Extract error details
    const errorMessage = execution?.error?.message ||
        trigger?.error?.message ||
        execution?.data?.resultData?.error?.message ||
        'Unknown error';
    const lastNode = execution?.lastNodeExecuted || 'Unknown';
    const executionId = execution?.id || 'N/A';
    const workflowId = workflow.id;
    const workflowName = workflow.name || 'Unknown';

    console.log('\n' + '='.repeat(60));
    console.log('WORKFLOW ERROR RECEIVED');
    console.log('='.repeat(60));
    console.log(`Workflow: ${workflowName} (ID: ${workflowId})`);
    console.log(`Failed Node: ${lastNode}`);
    console.log(`Error: ${errorMessage}`);
    console.log(`Execution ID: ${executionId}`);
    console.log('='.repeat(60));

    // Respond immediately to prevent n8n timeout
    res.json({
        success: true,
        workflowId: workflowId,
        workflowName: workflowName,
        message: 'Fix request received, Claude Code processing in background'
    });

    // Process fix in background with AI analysis and auto-retry
    processFixWithAI(workflowId, workflowName, lastNode, errorMessage, executionId);
});

// Process the fix with AI root cause analysis and auto-retry
async function processFixWithAI(workflowId, workflowName, lastNode, errorMessage, executionId) {
    try {
        // Step 1: Get AI-powered root cause analysis from Gemini
        console.log('\n[GEMINI] Analyzing root cause...');
        const fs = require('fs');
        let errorLogContent = '';
        try {
            errorLogContent = fs.readFileSync(ERROR_LOG, 'utf8');
        } catch (e) {
            errorLogContent = 'No previous errors logged.';
        }

        const aiAnalysis = await analyzeRootCause(errorMessage, lastNode, workflowName, errorLogContent);
        console.log('[GEMINI] Root Cause Analysis:');
        console.log('-'.repeat(40));
        console.log(aiAnalysis);
        console.log('-'.repeat(40));

        // Step 2: Build enhanced prompt with AI analysis
        const enhancedPrompt = `YOU ARE THE n8n AUTO-FIX AGENT.

Your ONLY purpose is to FIX broken n8n workflows. You are not a general assistant.
Read the "AUTO-FIX CLAUDE: YOUR MISSION" section in CLAUDE.md at "${CLAUDE_MD}" - that section is written specifically for you. ONLY read that section, ignore the rest.

============================================================
WORKFLOW FAILURE REPORT
============================================================
- Workflow ID: ${workflowId}
- Workflow Name: ${workflowName}
- Execution ID: ${executionId}
- Failed Node: ${lastNode}
- Error Message: ${errorMessage}
============================================================

============================================================
AI ROOT CAUSE ANALYSIS (from Gemini)
============================================================
${aiAnalysis}
============================================================

EXECUTE YOUR MISSION:
1. READ "${ERROR_LOG}" - Check for similar past errors and their fixes
2. CONSIDER the AI analysis above - it may help guide your fix
3. FETCH workflow using n8n_get_workflow with id "${workflowId}"
4. ANALYZE the broken node: ${lastNode}
5. FIX using n8n_update_partial_workflow - be surgical
6. LOG your fix to "${ERROR_LOG}" in this format:

## ${new Date().toISOString().split('T')[0]} - ${workflowName}
- **Workflow ID:** ${workflowId}
- **Failed Node:** ${lastNode}
- **Error:** ${errorMessage}
- **AI Analysis:** ${aiAnalysis.split('\n')[0]}
- **Root Cause:** [YOUR ANALYSIS]
- **Fix Applied:** [WHAT YOU DID]
- **Prevention:** [HOW TO AVOID IN FUTURE]
---

REMEMBER:
- You are the AUTO-FIX AGENT. Your job is to FIX, not chat.
- The error was: ${errorMessage}
- The broken node is: ${lastNode}
- Use the AI analysis to guide your fix
- NEVER FAIL. Find a solution.
- ALWAYS log your fix so future instances learn from you.

NOW FIX IT.`;

        // Step 3: Run Claude Code to fix
        console.log('\nSpawning Claude Code to fix...\n');
        await runClaudeCode(enhancedPrompt);

        console.log('\n' + '='.repeat(60));
        console.log('CLAUDE CODE COMPLETED - FIX APPLIED');
        console.log('='.repeat(60));

        // Step 4: Auto-retry the workflow after fix
        console.log('\n[AUTO-RETRY] Waiting 5 seconds before retrying workflow...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        const retryResult = await retryWorkflow(workflowId, workflowName);

        if (retryResult.success) {
            console.log('\n' + '='.repeat(60));
            console.log('SUCCESS: Workflow fixed and re-executed!');
            console.log('='.repeat(60) + '\n');
        } else {
            console.log('\n' + '='.repeat(60));
            console.log('WARNING: Fix applied but auto-retry failed');
            console.log('Manual re-execution may be needed');
            console.log('='.repeat(60) + '\n');
        }

    } catch (error) {
        console.error('\n[ERROR] Fix process failed:', error.message);
    }
}

// Function to spawn Claude Code with the fix prompt
function runClaudeCode(prompt) {
    return new Promise((resolve, reject) => {
        console.log('[SPAWN] Starting Claude Code process...');

        // Write prompt to a temp file to avoid argument length issues
        const fs = require('fs');
        const promptFile = path.join(__dirname, '.claude-prompt.txt');
        fs.writeFileSync(promptFile, prompt);

        // Spawn Claude Code via npx with MCP config for n8n tools, skills, and project access
        const claude = spawn('npx', [
            '@anthropic-ai/claude-code',
            '--dangerously-skip-permissions',
            '--print',
            '--mcp-config', MCP_CONFIG,
            '--add-dir', SKILLS_DIR,
            '--add-dir', PROJECT_DIR,
            '-p', prompt  // Use -p flag for prompt
        ], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                HOME: process.env.HOME,
                FORCE_COLOR: '0'  // Disable colors for cleaner output
            },
            shell: false
        });

        console.log('[SPAWN] Claude Code PID:', claude.pid);

        let output = '';
        let errorOutput = '';

        // Set encoding for proper text handling
        claude.stdout.setEncoding('utf8');
        claude.stderr.setEncoding('utf8');

        claude.stdout.on('data', (text) => {
            output += text;
            // Add prefix for visibility - print immediately
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    console.log(`[CLAUDE] ${line}`);
                }
            });
        });

        claude.stderr.on('data', (text) => {
            errorOutput += text;
            // Log stderr with prefix
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    console.log(`[CLAUDE-ERR] ${line}`);
                }
            });
        });

        claude.on('spawn', () => {
            console.log('[SPAWN] Claude Code process spawned successfully');
        });

        claude.on('close', (code, signal) => {
            console.log(`[SPAWN] Claude Code exited with code ${code}, signal ${signal}`);
            // Clean up temp file
            try { fs.unlinkSync(promptFile); } catch (e) {}

            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`Claude Code exited with code ${code}: ${errorOutput}`));
            }
        });

        claude.on('error', (err) => {
            console.log('[SPAWN] Error spawning Claude Code:', err.message);
            reject(err);
        });

        // Log if no output after 10 seconds
        setTimeout(() => {
            if (!output && !errorOutput) {
                console.log('[SPAWN] Warning: No output received after 10 seconds');
            }
        }, 10000);
    });
}

// Start the server
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('  n8n -> Claude Code Bridge Server');
    console.log('='.repeat(60));
    console.log(`  Status:    Running`);
    console.log(`  Port:      ${PORT}`);
    console.log(`  Endpoint:  POST /fix-workflow`);
    console.log(`  Health:    GET /health`);
    console.log('='.repeat(60));
    console.log('');
    console.log('Waiting for n8n workflow errors...');
    console.log('');
});
