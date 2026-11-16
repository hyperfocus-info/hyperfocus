import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createAcceptanceManifest } from '@hyperfocus/website-host/delivery';

const { values } = parseArgs({ args: Bun.argv.slice(2), strict: true, options: { artifact: { type: 'string' }, report: { type: 'string', multiple: true }, out: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) console.log('acceptance --artifact site.tar.gz --report verification.json [--report journey.json] --out acceptance.json. Reports require passed:true and artifactSha256. Human approval is not inferred.');
else {
  if (!values.artifact || !values.report || !values.out) throw new Error('Provide --artifact, --report and --out.');
  if ([values.artifact,...values.report].some(path => resolve(path).toLowerCase() === resolve(values.out!).toLowerCase())) throw new Error('The acceptance output must not replace its artifact or evidence.');
  const receipt = await createAcceptanceManifest({ artifactPath: values.artifact, reports: values.report });
  await Bun.write(values.out, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
