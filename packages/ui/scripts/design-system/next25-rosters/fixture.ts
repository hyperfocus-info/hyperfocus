import { createWorkspaceProjectState } from '@hyperfocus/ai-core/protocol';
import type { Page } from 'playwright';
const now = '2026-09-21T12:00:00.000Z';
export async function installRosterFixture(page: Page) {
    const commands: unknown[] = [];
    await page.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
    await page.routeWebSocket('**/*', socket => {
        const server = socket.connectToServer();
        socket.onMessage(message => {
            if (typeof message !== 'string')
                return;
            const event = JSON.parse(message);
            commands.push(event);
            if (event.type === 'connection.ping')
                socket.send(JSON.stringify({ type: 'connection.pong', requestId: event.requestId, payload: {} }));
        });
        server.onMessage(message => {
            if (typeof message !== 'string')
                return;
            const frame = JSON.parse(message);
            const event = frame.type === 'server.events-batch' ? frame.payload.events.find((item: {
                type: string;
            }) => item.type === 'connection.ready') : frame;
            if (event?.type !== 'connection.ready')
                return;
            const projects = Array.from({ length: 80 }, (_, index) => createWorkspaceProjectState({ id: `roster-project-${index}`, name: `Workspace ${String(index + 1).padStart(3, '0')} customer release`, rootPath: `C:/Work/customer-localization/workspace-${index}` }));
            const jobs = Array.from({ length: 80 }, (_, index) => ({ id: `roster-job-${index}`, projectId: projects[0]!.id, automationThreadId: `roster-thread-${index}`, kind: 'ai-routine', name: `Review ${String(index + 1).padStart(3, '0')} customer release`, description: 'Inspect the release and report recovery steps.', status: 'enabled', riskLevel: 'safe', lane: 'exclusive', definition: { kind: 'ai-routine', prompt: 'Review release.' }, schedule: { type: 'one-off', runAt: '2099-09-20T09:00:00.000Z', sourceText: 'Tomorrow at 9am' }, scheduleInput: 'Tomorrow at 9am', createdAt: now, updatedAt: now }));
            const runs = jobs.map((job, index) => ({ id: `roster-run-${index}`, jobId: job.id, projectId: job.projectId, automationThreadId: job.automationThreadId, triggerSource: 'manual', status: 'failed', riskLevel: 'safe', approvalStatus: 'not-needed', skippedOccurrenceCount: 0, summary: `Release evidence ${index + 1}`, failureMessage: 'Inspect the failure before retrying.', queuedAt: now, startedAt: now, completedAt: now, createdAt: now, updatedAt: now, events: [] }));
            const assistants = Array.from({ length: 80 }, (_, index) => ({ id: `roster-assistant-${index}`, name: `Reviewer ${String(index + 1).padStart(3, '0')} customer release`, scope: 'project', projectId: projects[0]!.id, description: 'Keeps release evidence and recovery steps current.', personalityPrompt: 'Be direct.', jobPrompt: 'Review releases.', agentId: 'pi', providerBrand: 'gpt', modeId: 'implement', executionModelId: 'openai/gpt-5.4', runState: 'active', bootstrapState: 'completed', failureStreakCount: 0, circuitBreakerState: 'closed', unreadQuestionCount: 0, createdAt: now, updatedAt: now }));
            event.payload.workspace = { projects, activeProjectId: projects[0]!.id, workspaceModes: [] };
            event.payload.backgroundJobs = { jobs, runs, templates: [], schedulerHeartbeatAt: new Date().toISOString() };
            event.payload.assistants = { assistants, threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] };
            event.payload.notifications = { items: [], unreadCount: 0, interactiveUnreadCount: 0, passiveUnreadCount: 0 };
            event.payload.executionControl = { ...event.payload.executionControl, isPaused: true };
            socket.send(JSON.stringify(event));
        });
    });
    return { commands };
}
