import type { CombatProject3D } from '@hyperfocus/engine/project/runtime-3d';

/** Current game defaults; factories keep editor/project mutations independent. */
export function touchOfDeathMovement(): NonNullable<CombatProject3D['movement']> {
  return { separateJump: true, accelerationScale: .76, exhaustedMovementScale: .8, speed: 6.916, sprintSpeed: 11.232,
    jumpSpeed: 11.615, jumpHoldFrames: 30, jumpHoldGravityScale: .62, jumpReleaseSpeedRatio: .327,
    dashSpeed: 14.364, dashEndSpeedRatio: .570025, airJumps: 1, wallSlideSpeed: 3, dashFrames: 10, dashRecoveryFrames: 18,
    airSteering: 9, coastDeceleration: 19.8, sprintHoldFrames: 15, stepCost: 10.8, sprintCost: 1.12, jumpCost: 12.6,
    jumpBufferFrames: 8, coyoteFrames: 5, wallRunFrames: 36, wallRunSpeed: 10, wallRunCost: .54, wallJumpCost: 12.6,
    wallJumpSpeed: 9, wallJumpPushSpeed: 7, autoStepHeight: 1.05, autoStepSpeedScale: .85 };
}

export function touchOfDeathInteractions(): NonNullable<CombatProject3D['interactions']> {
  return { weapons: [], grappleStartupFrames: 9, grappleTechFrames: 6, grappleRecoveryFrames: 19, grappleWhiffFrames: 20,
    grappleDamage: 6.5, grappleSpeed: 7.56, grappleVerticalSpeedScale: .9, grappleHitstunFrames: 69, projectileHitstunFrames: 28 };
}
