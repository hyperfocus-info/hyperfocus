import { probeCpuPreparation } from "../../src/swarm/probe.ts";

if (!['railway', 'local'].includes(process.env.HYPERFOCUS_SWARM_BACKEND ?? '') && !process.argv.includes('--allow-local')) {
  throw new Error('Run through the swarm execution provider; --allow-local explicitly permits a local diagnostic.');
}
console.log(JSON.stringify(await probeCpuPreparation()));
