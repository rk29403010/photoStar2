#!/usr/bin/env node
import { runCommandSync } from './process-invocation.js';

const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const queueLabel = 'repository-merge-queued';

export function selectQueueAdvancement({ baseRefName, headRefOid, mergeable, isDraft, labels }) {
    if (baseRefName !== 'main' || isDraft || !labels.includes(queueLabel)) {return 'not-published-queue';}
    if (mergeable === 'CONFLICTING') {return 'conflicting-source';}
    if (mergeable !== 'MERGEABLE') {return 'not-clean';}
    return headRefOid ? 'update-clean' : 'invalid-pr';
}

function invoke(args, input) {
    const result = runCommandSync({ command: gh, args, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    if ((result.status ?? 1) !== 0) {throw new Error(result.stderr?.trim() || 'GitHub CLI command failed.');}
    return result.stdout.trim();
}

function reasonComment(reason) {return `<!-- photostar2-queue-advance:${reason} -->\nqueue-advance=${reason}`;}

function main() {
    const query = `query { repository(owner: "${process.env.GITHUB_REPOSITORY_OWNER}", name: "${process.env.GITHUB_REPOSITORY?.split('/')[1]}") { pullRequests(first: 100, states: OPEN, baseRefName: "main") { nodes { id number headRefOid baseRefName mergeable isDraft labels(first: 20) { nodes { name } } } } } }`;
    const payload = JSON.parse(invoke(['api', 'graphql', '-f', `query=${query}`]));
    const pullRequests = payload.data.repository.pullRequests.nodes;
    for (const pullRequest of pullRequests) {
        const reason = selectQueueAdvancement({ ...pullRequest, labels: pullRequest.labels.nodes.map((label) => label.name) });
        if (reason === 'not-published-queue') {continue;}
        if (reason === 'update-clean') {
            const mutation = 'mutation($id:ID!, $head:GitObjectID!) { updatePullRequestBranch(input:{pullRequestId:$id, expectedHeadOid:$head}) { pullRequest { number } } }';
            invoke(['api', 'graphql', '-f', `query=${mutation}`, '-F', `id=${pullRequest.id}`, '-F', `head=${pullRequest.headRefOid}`]);
            console.log(`QUEUE_ADVANCEMENT={"pr":${pullRequest.number},"reason":"updated-clean"}`);
            invoke(['pr', 'comment', String(pullRequest.number), '--body', reasonComment('updated-clean')]);
            continue;
        }
        console.log(`QUEUE_ADVANCEMENT={"pr":${pullRequest.number},"reason":"${reason}"}`);
        invoke(['pr', 'comment', String(pullRequest.number), '--body', reasonComment(reason)]);
    }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
    try {main();} catch (error) {console.error(error instanceof Error ? error.message : String(error)); process.exit(1);}
}
