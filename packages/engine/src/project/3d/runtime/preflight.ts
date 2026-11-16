import { auditPlayProject3D } from '../play/contracts.ts';
import { auditCombatProject3D } from '../combat-preflight.ts';
import { parseDeclaration, preflightFailure, type PortableAsset3D, type Hyperfocus3DDiagnostic, type Hyperfocus3DDeclaration } from '../declaration.ts';
import { sceneResources3D } from '../../delivery/scene-resources-3d.ts';
import { cookRuntimeAssets3D } from '../runtime-assets.ts';
import { assertReferenceProject3D } from '../reference.ts';
import { verifyReferenceAssets3D } from '../reference-runtime.ts';

export function auditHyperfocus3DProject(project: unknown, assets: readonly PortableAsset3D[]): Hyperfocus3DDiagnostic[] {
  const diagnostics: Hyperfocus3DDiagnostic[] = [];
  const declaration = parseDeclaration(project, assets, diagnostics);
  auditCombatProject3D({ project, declaration, diagnostics });
  auditPlayProject3D(project, declaration, diagnostics);
  try { assertReferenceProject3D(project, declaration); }
  catch (cause) { diagnostics.push({ severity: 'error', code: 'reference-geometry', pointer: '/extensions/hyperfocusReference3D', message: cause instanceof Error ? cause.message : String(cause) }); }
  return diagnostics;
}

/** Reads a valid declaration without requiring its archive assets to be loaded. */
export function readHyperfocus3DDeclaration(project: unknown): Hyperfocus3DDeclaration | undefined {
  const diagnostics: Hyperfocus3DDiagnostic[] = [];
  const declaration = parseDeclaration(project, undefined, diagnostics);
  return declaration && diagnostics.length === 0 ? declaration : undefined;
}

/** Validates an authoring declaration while preserving its canonical object identity. */
export function readMutableHyperfocus3DDeclaration(project: { extensions?: Record<string, unknown> }): Hyperfocus3DDeclaration | undefined {
  const declaration = project.extensions?.hyperfocus3D;
  return isMutableDeclaration(declaration) ? declaration : undefined;
}
function isMutableDeclaration(value: unknown): value is Hyperfocus3DDeclaration {
  return readHyperfocus3DDeclaration({ extensions: { hyperfocus3D: value } }) !== undefined;
}

/** Shared structural validation and immutable asset cooking, before scene allocation. */
export async function prepareRuntimeProject3D(project: unknown, assets: readonly PortableAsset3D[]) {
  const diagnostics: Hyperfocus3DDiagnostic[] = [];
  const declaration = parseDeclaration(project, undefined, diagnostics);
  auditCombatProject3D({ project, declaration, diagnostics });
  auditPlayProject3D(project, declaration, diagnostics);
  if (!declaration || diagnostics.length) throw preflightFailure(auditHyperfocus3DProject(project, assets));
  const reference = assertReferenceProject3D(project, declaration);
  const resources = sceneResources3D({ project, declaration });
  parseDeclaration({ extensions: { hyperfocus3D: resources } }, assets, diagnostics);
  if (diagnostics.length) throw preflightFailure(diagnostics);
  const { assetById, cookedById, rigById } = await cookRuntimeAssets3D({ declaration: resources, assets, diagnostics });
  if (reference) await verifyReferenceAssets3D({ contract: reference, declaration, assets, cooked: cookedById });

  return { declaration, resources, diagnostics, assetById, cookedById, rigById };
}
