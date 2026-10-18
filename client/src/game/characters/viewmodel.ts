import * as THREE from "three";
import { CLASS_TUNING, DEFAULT_WEAPON_SLOT, PlayerClass, Team, WeaponType, rangedWeaponForClass } from "@janissary/shared";
import { loadModel } from "../models/loader";
import { CHARACTER_WEAPON_MODELS, WEAPON_MODELS } from "../models/manifest";

/**
 * Viewmodel — first-person weapon models attached to the camera.
 *
 * One root group sits at the bottom-right of the view (camera space, near
 * plane is 0.05 so nothing clips walls) and holds one procedurally-built
 * group per weapon. Silhouette-first per the visual bible: the arquebus is a
 * long thin barrel + curved wooden stock, the crossbow a wide horizontal
 * steel prod on a short tiller — the two primaries can never be confused.
 *
 * Loadouts (setLoadout + the Phase 8e-3 slot argument):
 *  - mounted cavalry          → lance (faction pennon) + faction blade
 *  - slot 1 (blade)           → Byzantine war mace / Ottoman kilij
 *  - slot 2 (primary)         → arquebus / crossbow, drum for Mehter, standard
 *                               for Priest (their support primaries stay)
 *  - slot 3 (sidearm)         → dagger
 * Blade meshes upgrade from the procedural builds to the CC0 medieval-pack
 * glbs once the cached loader resolves (fire-and-forget swap-in; the
 * procedural build is the fallback and first-frame stand-in). The arquebus
 * body upgrades the same way to the owner-generated 1.35 m matchlock —
 * keeping the procedural flash quads and ramrod so the 8e-1 flash and the
 * reload pump survive the swap. The crossbow upgrades to the owner-generated
 * heavy crossbow as one textured body inside a tiny snap/reload wrapper; the
 * fallback uses the same wrapper, so firing feedback survives either path.
 *
 * Entrenching tools are NOT loadouts: playShovelUse("raise"|"dig") swaps the
 * visible weapon for the matching shovel (blade-up + dirt clod for raise,
 * blade-down worn for dig), plays a heave/chop swing, then restores the
 * previous loadout. playDenied() jerks the visible group for a rejected
 * placement.
 *
 * Animation model: all motion is spring/tween state machines driven by
 * update(dt); zero per-frame allocation. Priority shovel > melee > reload >
 * recoil > spawn-ready > idle bob: while shovel, melee or reload is active
 * the walk bob is suppressed; the melee arc composes on top of reload
 * (reload keeps timing underneath and its lower-weapon pose is re-applied
 * when melee ends). A shovel swing cancels a melee arc and overrides the
 * reload pose visually while reload timing continues underneath.
 * Fire during reload CANCELS the reload pose (weight tweens back out) and
 * applies recoil immediately — the server still governs whether the shot
 * actually fires, this is purely cosmetic.
 *
 * Juice stays subtle: recoil pitch peaks ≤ ~3°, bob is 2–4 mm, reload tilt
 * ≤ ~20°. Muzzle flash is additive quads at the arquebus muzzle for ~90 ms
 * with a deterministic per-shot scale/rotation jitter (hash of a shot
 * counter, no RNG). The crossbow instead plays a tiny prod/string snap
 * spring — no flash.
 */
export class Viewmodel {
  readonly #camera: THREE.PerspectiveCamera;
  readonly #root = new THREE.Group();
  readonly #groups: Record<WeaponSlot, THREE.Group>;
  readonly #trimMaterials: { material: THREE.MeshStandardMaterial; defaultColor: number }[] = [];
  readonly #flashMaterials: THREE.MeshBasicMaterial[] = [];
  readonly #flashMeshes: THREE.Object3D[] = [];
  readonly #ramrod: THREE.Mesh;
  readonly #prod: THREE.Group;
  readonly #pennonMaterial: THREE.MeshStandardMaterial;

  /** Which primary fire behavior is active (flash vs prod-snap vs none). */
  #primary: "arquebus" | "crossbow" | "none" = "none";
  /** True once the authored matchlock has replaced the procedural body. */
  #firearmReady = false;

  // Phase 8e-7 ADS blend weight (0=hip, 1=shouldered), driven per frame by
  // GameClient (the exponential smoothing lives there with the FOV/sens
  // drivers so all three stay in lockstep). Gated to ranged primaries.
  #aimWeight = 0;

  // Spawn-ready tween (raise + rotate-settle).
  #spawnT = SPAWN_SECONDS;
  // Reload tween; weight tweens in/out so interrupts recover smoothly.
  #reloadT = 0;
  #reloadDuration = 0;
  #reloadWeight = 0;
  // Melee arc tween (counts down).
  #meleeT = 0;
  // Recoil spring (translate back + pitch up).
  #recoilPos = 0;
  #recoilVel = 0;
  #recoilPitch = 0;
  #recoilPitchVel = 0;
  // Crossbow prod snap spring.
  #prodPos = 0;
  #prodVel = 0;
  // Muzzle flash timer + deterministic per-shot variation seed.
  #flashT = 0;
  #shotCount = 0;
  // Walk bob.
  #bobPhase = 0;
  #bobSuppress = 0;
  // Shovel use swing (counts down from SHOVEL_TOTAL_SECONDS; auto-restores).
  #shovelT = 0;
  #shovelKind: "raise" | "dig" = "raise";
  readonly #shovelRestore: THREE.Group[] = [];
  // Denied-placement jerk (counts down).
  #deniedT = 0;
  // Slot-switch draw/holster tween (Phase 8e-3): the current weapon lowers
  // for the first half, visibility swaps at the midpoint, the new weapon
  // raises for the second half — the player SEES the server-side draw cost.
  #switchT = 0;
  #switchDuration = 0;
  #switchHalfDone = false;
  #switchPending: { playerClass: PlayerClass; mounted: boolean; slot: number } | undefined;
  // glb blade upgrades already requested (loader caches; one shot per kind).
  readonly #glbRequested = new Set<string>();

  constructor(camera: THREE.PerspectiveCamera) {
    this.#camera = camera;
    this.#root.position.set(BASE_X, BASE_Y, BASE_Z);
    this.#root.name = "viewmodel-root";

    const arquebus = this.#buildArquebus();
    this.#ramrod = arquebus.ramrod;
    const crossbow = this.#buildCrossbow();
    this.#prod = crossbow.prod;
    const lance = this.#buildLance();
    this.#pennonMaterial = lance.pennonMaterial;
    this.#groups = {
      arquebus: arquebus.group,
      crossbow: crossbow.group,
      lance: lance.group,
      saber: this.#buildSaber(),
      sword: this.#buildSword(),
      mace: this.#buildMace(),
      dagger: this.#buildDagger(),
      drum: this.#buildDrum(),
      standard: this.#buildStandard(),
      shovelRaise: this.#buildShovelRaise(),
      shovelDig: this.#buildShovelDig(),
    };
    for (const key of Object.keys(this.#groups) as WeaponSlot[]) {
      const group = this.#groups[key];
      group.visible = false;
      this.#root.add(group);
    }
    this.#root.traverse((object) => {
      object.frustumCulled = false;
    });
    camera.add(this.#root);
    // glb blade upgrades (8e-3): swap each procedural blade's contents for the
    // medieval-pack model when the cached load resolves. Fire-and-forget —
    // the procedural build is the fallback and first-session stand-in.
    this.#upgradeBlade(this.#groups.sword, WEAPON_MODELS.sword, SWORD_GLB_METERS);
    this.#upgradeBlade(this.#groups.saber, CHARACTER_WEAPON_MODELS.kilijSword, SWORD_GLB_METERS);
    this.#upgradeBlade(this.#groups.mace, CHARACTER_WEAPON_MODELS.warMace, MACE_GLB_METERS);
    this.#upgradeBlade(this.#groups.dagger, CHARACTER_WEAPON_MODELS.yatagan, DAGGER_GLB_METERS);
    // The owner-generated 1.35 m matchlock is the actual first-person firearm;
    // the shorter generic rifle is retained only as sourced inventory.
    this.#upgradeFirearm(this.#groups.arquebus);
    // The prepared heavy crossbow is the actual Byzantine first-person
    // primary. Its one-piece mesh moves inside #prod so the subtle firing and
    // spanning feedback remains visible without inventing a separable limb.
    this.#upgradeCrossbow(this.#prod);
  }

  /**
   * Swaps the arquebus group's procedural body for the prepared Meshy
   * matchlock. The flash quads and the ramrod survive the swap
   * (the 8e-1 flash and the reload pump are the arquebus's fire/reload
   * feedback); the flash quads re-anchor to the glb's fitted muzzle. The
   * procedural build stays as the fallback until the load resolves.
   */
  #upgradeFirearm(group: THREE.Group): void {
    const path = CHARACTER_WEAPON_MODELS.matchlockArquebus;
    if (this.#glbRequested.has(path)) return;
    this.#glbRequested.add(path);
    void loadModel(path).then((model) => {
      const geometry = model.geometry.clone();
      const muzzleZ = firearmFit(geometry);
      // ADR 0018/0032 material discipline: clone the cached atlas material —
      // the loader hands out one shared material per path and dispose()
      // below disposes what this rig holds, which must not be the cache's.
      const mesh = new THREE.Mesh(geometry, model.material.clone());
      mesh.frustumCulled = false;
      const keep = new Set<THREE.Object3D>([...this.#flashMeshes, this.#ramrod]);
      for (const child of [...group.children]) {
        if (!keep.has(child)) group.remove(child);
      }
      group.add(mesh);
      // Re-anchor the flash to the glb's actual muzzle tip, and thicken the
      // procedural ramrod slightly so it swallows any rod baked into the glb
      // instead of z-fighting it (the reload pump animation keeps working).
      for (const flash of this.#flashMeshes) flash.position.set(0, BORE_Y, muzzleZ - 0.01);
      this.#ramrod.scale.set(1.25, 1, 1.25);
      this.#firearmReady = true;
    }).catch(() => undefined);
  }

  /** Swaps the procedural crossbow for the fitted owner-generated GLB. */
  #upgradeCrossbow(snap: THREE.Group): void {
    const path = CHARACTER_WEAPON_MODELS.heavyCrossbow;
    if (this.#glbRequested.has(path)) return;
    this.#glbRequested.add(path);
    void loadModel(path).then((model) => {
      const geometry = model.geometry.clone();
      crossbowFit(geometry);
      const mesh = new THREE.Mesh(geometry, model.material.clone());
      mesh.frustumCulled = false;
      snap.clear();
      snap.add(mesh);
    }).catch(() => undefined);
  }

  /** Swaps a blade group's procedural contents for the fitted glb (once). */
  #upgradeBlade(group: THREE.Group, path: string, lengthMeters: number): void {
    if (this.#glbRequested.has(path)) return;
    this.#glbRequested.add(path);
    void loadModel(path).then((model) => {
      const geometry = model.geometry.clone();
      bladeFit(geometry, lengthMeters);
      const mesh = new THREE.Mesh(geometry, model.material);
      mesh.frustumCulled = false;
      group.clear(); // shared module-level materials/geometries: never disposed here
      group.add(mesh);
    }).catch(() => undefined);
  }

  /** Show the weapon set for the class and 1-based slot (8e-3); mounted cavalry shows lance+blade regardless of slot. */
  setLoadout(playerClass: PlayerClass, mounted: boolean, slot: number = DEFAULT_WEAPON_SLOT): void {
    this.#switchT = 0;
    this.#switchPending = undefined;
    this.#applyLoadout(playerClass, mounted, slot);
  }

  /**
   * Draw/holster tween (8e-3): keeps the CURRENT weapon for the first half
   * (lowered out of view), swaps to the new loadout at the midpoint, and
   * raises it for the second half — the visible cost of the server's
   * WEAPON_SWITCH_SECONDS draw timer.
   */
  startSwitch(playerClass: PlayerClass, mounted: boolean, slot: number, durationSeconds: number): void {
    if (durationSeconds <= 0) { this.setLoadout(playerClass, mounted, slot); return; }
    this.#switchT = durationSeconds;
    this.#switchDuration = durationSeconds;
    this.#switchHalfDone = false;
    this.#switchPending = { playerClass, mounted, slot };
  }

  #applyLoadout(playerClass: PlayerClass, mounted: boolean, slot: number): void {
    const tuning = CLASS_TUNING[playerClass];
    this.#shovelT = 0; // a loadout change cancels any pending shovel restore
    this.#shovelRestore.length = 0;
    for (const key of Object.keys(this.#groups) as WeaponSlot[]) this.#groups[key].visible = false;
    this.#primary = "none";
    if (mounted && tuning.cavalry) {
      this.#groups.lance.visible = true;
      this.#pennonMaterial.color.setHex(tuning.team === Team.Ottoman ? PENNON_OTTOMAN : PENNON_BYZANTINE);
      (tuning.team === Team.Ottoman ? this.#groups.saber : this.#groups.mace).visible = true;
    } else if (slot === 1) {
      // Byzantine slot 1 is the same visual war-mace prop used by remote
      // Byzantine rigs; Ottoman slot 1 keeps the kilij silhouette.
      (tuning.team === Team.Ottoman ? this.#groups.saber : this.#groups.mace).visible = true;
    } else if (slot === 3) {
      this.#groups.dagger.visible = true;
    } else if (playerClass === PlayerClass.Mehter) {
      this.#groups.drum.visible = true;
    } else if (playerClass === PlayerClass.Priest) {
      this.#groups.standard.visible = true;
    } else if (rangedWeaponForClass(playerClass, tuning.team).id === WeaponType.Arquebus) {
      this.#groups.arquebus.visible = true;
      this.#primary = "arquebus";
    } else {
      this.#groups.crossbow.visible = true;
      this.#primary = "crossbow";
    }
  }

  /** Hide/show the whole first-person rig (third-person camera mode). */
  setVisible(visible: boolean): void {
    this.#root.visible = visible;
  }

  /**
   * Phase 8e-7: ADS blend weight 0..1 (already smoothed by the caller).
   * Blends the rig from the hip pose toward the shouldered center pose; a
   * no-op for loadouts without a ranged primary (blades, lance, drum,
   * standard) so a melee pose can never break.
   */
  setAimWeight(weight: number): void {
    this.#aimWeight = Math.max(0, Math.min(1, weight));
  }

  /** Brief "ready"/inspect animation: weapon raises into view with a subtle rotate-settle (~0.9s). */
  onSpawn(): void {
    this.#spawnT = 0;
  }

  /** Recoil kick + muzzle flash (arquebus) or prod snap (crossbow). Cancels an active reload pose. */
  onFire(): void {
    if (this.#primary === "none") return;
    this.#reloadDuration = 0; // reload pose tweens back out via weight
    if (this.#primary === "arquebus") {
      this.#recoilVel += RECOIL_KICK;
      this.#recoilPitchVel += RECOIL_PITCH_KICK;
      this.#flashT = FLASH_SECONDS;
      this.#shotCount += 1;
      const jitter = hash01(this.#shotCount);
      const scale = FLASH_BASE_SCALE * (0.85 + 0.3 * jitter);
      for (const mesh of this.#flashMeshes) mesh.scale.setScalar(scale);
      const angle = hash01(this.#shotCount + 0.5) * Math.PI * 2;
      const first = this.#flashMeshes[0];
      if (first !== undefined) first.rotation.z = angle;
    } else {
      this.#prodVel += PROD_SNAP_KICK;
    }
  }

  /** Lower-weapon reload sequence scaled to durationSeconds (arquebus ramrod / crossbow span-crank phases). */
  onReloadStart(durationSeconds: number): void {
    if (this.#primary === "none" || durationSeconds <= 0) return;
    this.#reloadT = 0;
    this.#reloadDuration = durationSeconds;
  }

  /** Quick melee arc across the view (~0.3s). */
  onMelee(): void {
    this.#meleeT = MELEE_SECONDS;
  }

  /**
   * Entrenching-tool use: swaps the visible weapon for the matching shovel
   * (raise = blade-up, dig = blade-down), plays a ~0.65s swing (upward heave
   * for raise, downward chop for dig, both with a spring-settle recovery),
   * then restores the previous loadout after ~1.2s total. Wins over melee;
   * reload timing continues underneath. Calling again re-triggers with the
   * new kind and keeps the original restore set.
   */
  playShovelUse(kind: "raise" | "dig"): void {
    if (this.#shovelT === 0) {
      // remember what's on screen so we can restore it after the swing
      this.#shovelRestore.length = 0;
      for (const key of Object.keys(this.#groups) as WeaponSlot[]) {
        const group = this.#groups[key];
        if (group.visible) this.#shovelRestore.push(group);
      }
    }
    for (const key of Object.keys(this.#groups) as WeaponSlot[]) this.#groups[key].visible = false;
    this.#groups[kind === "raise" ? "shovelRaise" : "shovelDig"].visible = true;
    this.#shovelKind = kind;
    this.#shovelT = SHOVEL_TOTAL_SECONDS;
    this.#meleeT = 0; // the shovel swing wins over a melee arc
  }

  /** Rejected-placement read: short downward jerk + twist (~0.25s) on whatever group is visible. */
  playDenied(): void {
    this.#deniedT = DENIED_SECONDS;
  }

  #endShovelUse(): void {
    this.#groups[this.#shovelKind === "raise" ? "shovelRaise" : "shovelDig"].visible = false;
    for (const group of this.#shovelRestore) group.visible = true;
    this.#shovelRestore.length = 0;
  }

  /** dt seconds; moveSpeed01 = 0..1 movement amount for walk bob (subtle, ~2-4mm amplitude). */
  update(dtSeconds: number, moveSpeed01: number): void {
    const dt = Math.min(dtSeconds, 0.1); // clamp hitches so springs stay stable
    const speed = Math.min(Math.max(moveSpeed01, 0), 1);
    // ADS blend (8e-7): shouldering only exists for a ranged primary.
    const aim = this.#primary === "none" ? 0 : this.#aimWeight;

    // --- timers ---
    if (this.#spawnT < SPAWN_SECONDS) this.#spawnT = Math.min(this.#spawnT + dt, SPAWN_SECONDS);
    if (this.#meleeT > 0) this.#meleeT = Math.max(this.#meleeT - dt, 0);
    if (this.#flashT > 0) this.#flashT = Math.max(this.#flashT - dt, 0);
    if (this.#deniedT > 0) this.#deniedT = Math.max(this.#deniedT - dt, 0);
    if (this.#switchT > 0) {
      this.#switchT = Math.max(this.#switchT - dt, 0);
      // Midpoint swap: old weapon fully lowered, the new one rises from here.
      if (!this.#switchHalfDone && this.#switchDuration - this.#switchT >= this.#switchDuration / 2) {
        this.#switchHalfDone = true;
        const pending = this.#switchPending;
        if (pending !== undefined) this.#applyLoadout(pending.playerClass, pending.mounted, pending.slot);
      }
      if (this.#switchT === 0) this.#switchPending = undefined;
    }
    if (this.#shovelT > 0) {
      this.#shovelT = Math.max(this.#shovelT - dt, 0);
      if (this.#shovelT === 0) this.#endShovelUse();
    }
    // The reload pose freezes while the ranged weapon is holstered (8e-3) —
    // the server freezes the reload itself, so the pose must not finish early.
    if (this.#reloadDuration > 0 && this.#primary !== "none") {
      this.#reloadT += dt;
      if (this.#reloadT >= this.#reloadDuration) this.#reloadDuration = 0; // finished
    }
    const reloadTarget = this.#reloadDuration > 0 && this.#primary !== "none" ? 1 : 0;
    const reloadRate = reloadTarget > this.#reloadWeight ? 6 : 4; // lower fast, rise a bit slower
    // Phase 8c-5b: exponential smoothing (1 - exp(-rate*dt)) instead of the
    // linear (rate*dt) approximation, so the tween is frame-rate independent.
    this.#reloadWeight += (reloadTarget - this.#reloadWeight) * (1 - Math.exp(-reloadRate * dt));
    if (Math.abs(this.#reloadWeight - reloadTarget) < 0.001) this.#reloadWeight = reloadTarget;

    // --- springs (semi-implicit Euler at a FIXED sub-step) ---
    // Phase 8c-5b: these used the raw frame delta with a 0.1 s clamp, which
    // is stable at 25 fps (damping limits 2/c = 154 ms) but settles with a
    // different shape at every frame rate — the same frame-rate dependence
    // the camera springs had before cameraFeel.ts. Sub-stepping at 1/240 s
    // makes the recoil/prod settle frame-rate independent (same fix, same
    // pattern as cameraFeel).
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(SPRING_SUB_STEP, remaining);
      remaining -= step;
      this.#recoilVel += (-RECOIL_STIFFNESS * this.#recoilPos - RECOIL_DAMPING * this.#recoilVel) * step;
      this.#recoilPos += this.#recoilVel * step;
      this.#recoilPitchVel += (-RECOIL_STIFFNESS * this.#recoilPitch - RECOIL_DAMPING * this.#recoilPitchVel) * step;
      this.#recoilPitch += this.#recoilPitchVel * step;
      this.#prodVel += (-PROD_STIFFNESS * this.#prodPos - PROD_DAMPING * this.#prodVel) * step;
      this.#prodPos += this.#prodVel * step;
    }
    this.#prod.position.z = this.#prodPos;

    // --- walk bob (suppressed while shovel/melee/reload/switch owns the pose) ---
    const busy = this.#meleeT > 0 || this.#reloadWeight > 0.05 || this.#shovelT > 0 || this.#switchT > 0;
    this.#bobSuppress += ((busy ? 0 : 1) - this.#bobSuppress) * (1 - Math.exp(-8 * dt));
    this.#bobPhase += dt * (BOB_BASE_FREQ + BOB_RUN_FREQ * speed);
    // A shouldered weapon sways less (8e-7's "slower sway" — the bob is the
    // only sway system; sensitivity scaling covers aim turn rate).
    const bobAmp = (BOB_REST_AMP + (BOB_RUN_AMP - BOB_REST_AMP) * speed) * this.#bobSuppress * (1 - BOB_AIM_SCALE * aim);

    // --- compose pose (additive offsets on top of the base position) ---
    let ox = Math.cos(this.#bobPhase) * bobAmp;
    let oy = Math.abs(Math.sin(this.#bobPhase)) * bobAmp * -0.8;
    let oz = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;

    // spawn-ready: raise from below with a small rotate-settle
    if (this.#spawnT < SPAWN_SECONDS) {
      const settle = 1 - easeOutBack(this.#spawnT / SPAWN_SECONDS, SPAWN_OVERSHOOT);
      oy -= settle * SPAWN_DROP;
      rx += settle * SPAWN_TILT;
    }

    // reload pose (per-weapon phases), faded by weight
    if (this.#reloadWeight > 0.001) {
      const p = this.#reloadDuration > 0 ? Math.min(this.#reloadT / this.#reloadDuration, 1) : 1;
      const w = this.#reloadWeight;
      if (this.#primary === "arquebus") {
        // tilt down across the whole cycle; ramrod hint pumps mid-phase
        oy -= RELOAD_DROP * w * reloadHold(p);
        rx += RELOAD_TILT * w * reloadHold(p);
        const pump = p > 0.3 && p < 0.75 ? Math.sin((p - 0.3) / 0.45 * Math.PI * 3) : 0;
        this.#ramrod.position.z = RAMROD_BASE_Z + pump * RAMROD_TRAVEL * w;
      } else if (this.#primary === "crossbow") {
        // span phase pulls the prod back, crank phase rocks the tiller
        oy -= RELOAD_DROP * 0.8 * w * reloadHold(p);
        rx += RELOAD_TILT * 0.7 * w * reloadHold(p);
        const span = p < 0.4 ? easeOutCubic(p / 0.4) : p < 0.75 ? 1 : 1 - easeOutCubic((p - 0.75) / 0.25);
        this.#prod.position.z = this.#prodPos - span * PROD_SPAN_PULL * w;
        rz += (p > 0.4 && p < 0.75 ? Math.sin((p - 0.4) / 0.35 * Math.PI * 4) * CRANK_ROCK : 0) * w;
      }
    } else if (this.#primary === "arquebus") {
      this.#ramrod.position.z = RAMROD_BASE_Z;
    }

    // recoil spring on top
    oz += this.#recoilPos;
    rx += this.#recoilPitch;

    // slot switch (8e-3): lower for the first half, raise for the second —
    // a simple symmetric ease so the draw reads at any frame rate
    if (this.#switchT > 0 && this.#switchDuration > 0) {
      const p = (this.#switchDuration - this.#switchT) / this.#switchDuration; // 0→1
      const lower = p < 0.5 ? easeOutCubic(p * 2) : 1 - easeOutCubic((p - 0.5) * 2);
      oy -= SWITCH_DROP * lower;
      rx += SWITCH_TILT * lower;
    }

    // melee arc: a fast diagonal sweep across the view, eased out and back
    if (this.#meleeT > 0 && this.#shovelT === 0) {
      const t = 1 - this.#meleeT / MELEE_SECONDS;
      const swing = Math.sin(t * Math.PI); // 0→1→0
      const sweep = easeOutCubic(Math.min(t * 1.6, 1));
      rz -= swing * MELEE_ROLL;
      ry += swing * MELEE_YAW;
      ox += (sweep - 0.5) * MELEE_SWEEP_X * swing;
      oy -= swing * MELEE_LIFT;
    }

    // shovel use swing: anticipation → strike → damped spring settle, then a
    // neutral hold until the timer restores the previous loadout
    if (this.#shovelT > 0) {
      const p = Math.min((SHOVEL_TOTAL_SECONDS - this.#shovelT) / SHOVEL_SWING_SECONDS, 1);
      if (this.#shovelKind === "raise") {
        // dip, then an upward heave with a follow-through settle
        if (p < SHOVEL_ANT) {
          const a = easeOutCubic(p / SHOVEL_ANT);
          oy -= a * SHOVEL_ANT_DIP;
          rx += a * SHOVEL_ANT_TILT;
        } else if (p < SHOVEL_STRIKE) {
          const s = easeOutCubic((p - SHOVEL_ANT) / (SHOVEL_STRIKE - SHOVEL_ANT));
          oy += s * (SHOVEL_HEAVE + SHOVEL_ANT_DIP) - SHOVEL_ANT_DIP;
          rx += SHOVEL_ANT_TILT - s * (SHOVEL_ANT_TILT + SHOVEL_HEAVE_TILT);
        } else {
          const settle = springSettle((p - SHOVEL_STRIKE) / (1 - SHOVEL_STRIKE));
          oy += settle * SHOVEL_HEAVE;
          rx -= settle * SHOVEL_HEAVE_TILT;
        }
      } else {
        // lift, then a downward chop with a slight forward push and recovery
        if (p < SHOVEL_ANT) {
          const a = easeOutCubic(p / SHOVEL_ANT);
          oy += a * SHOVEL_ANT_LIFT;
          rx -= a * SHOVEL_ANT_TILT;
        } else if (p < SHOVEL_STRIKE) {
          const s = easeOutCubic((p - SHOVEL_ANT) / (SHOVEL_STRIKE - SHOVEL_ANT));
          oy += SHOVEL_ANT_LIFT - s * (SHOVEL_ANT_LIFT + SHOVEL_CHOP);
          rx += s * (SHOVEL_ANT_TILT + SHOVEL_CHOP_TILT) - SHOVEL_ANT_TILT;
          oz -= s * SHOVEL_CHOP_PUSH;
        } else {
          const settle = springSettle((p - SHOVEL_STRIKE) / (1 - SHOVEL_STRIKE));
          oy -= settle * SHOVEL_CHOP;
          rx += settle * SHOVEL_CHOP_TILT;
          oz -= settle * SHOVEL_CHOP_PUSH;
        }
      }
    }

    // denied placement: quick downward jerk + twist on the visible group
    if (this.#deniedT > 0) {
      const j = Math.sin((1 - this.#deniedT / DENIED_SECONDS) * Math.PI);
      oy -= j * DENIED_DIP;
      rz += j * DENIED_TWIST;
    }

    // ADS (8e-7): blend the rig's base pose from hip (BASE_*) to shouldered
    // (AIM_*); all animation offsets above compose on top of the blend. The
    // small aim yaw cant blends the same way (see AIM_ROT_YAW's rationale).
    // The authored matchlock shoulders at its own pose (AIM_RIFLE_* — see its
    // constant block); the procedural fallback and crossbow keep AIM_*.
    const rifleAim = this.#primary === "arquebus" && this.#firearmReady;
    const aimX = rifleAim ? AIM_RIFLE_X : AIM_X;
    const aimY = rifleAim ? AIM_RIFLE_Y : AIM_Y;
    const aimZ = rifleAim ? AIM_RIFLE_Z : AIM_Z;
    const aimYaw = rifleAim ? AIM_RIFLE_ROT_YAW : AIM_ROT_YAW;
    const bx = BASE_X + (aimX - BASE_X) * aim;
    const by = BASE_Y + (aimY - BASE_Y) * aim;
    const bz = BASE_Z + (aimZ - BASE_Z) * aim;
    this.#root.position.set(bx + ox, by + oy, bz + oz);
    this.#root.rotation.set(rx, ry + aimYaw * aim, rz);

    // --- muzzle flash ---
    const flashVisible = this.#flashT > 0;
    for (const mesh of this.#flashMeshes) mesh.visible = flashVisible;
    if (flashVisible) {
      const fade = this.#flashT / FLASH_SECONDS;
      for (const material of this.#flashMaterials) material.opacity = fade;
    }
  }

  /** Tints trim/accent materials (reward skins); undefined resets to default. */
  setSkinTint(trimColor?: number): void {
    for (const entry of this.#trimMaterials) {
      entry.material.color.setHex(trimColor ?? entry.defaultColor);
    }
  }

  /** Removes from camera, disposes all geometries/materials. */
  dispose(): void {
    this.#camera.remove(this.#root);
    this.#root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) {
          for (const m of material) m.dispose();
        } else {
          material.dispose();
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Procedural weapon builders. Every mesh shares module-level materials where
  // possible; tintable trim materials are registered for setSkinTint.
  // ---------------------------------------------------------------------------

  #trim(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    this.#trimMaterials.push({ material, defaultColor: material.color.getHex() });
    return material;
  }

  #buildArquebus(): { group: THREE.Group; ramrod: THREE.Mesh } {
    const group = new THREE.Group();
    group.name = "vm-arquebus";

    // long steel barrel, dark metal
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.78, 8), matSteel());
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.16);
    // muzzle band + two barrel bands pinning barrel to stock
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8), matSteel());
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.015, -0.52);
    const bandMid = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.014, 8), matSteel());
    bandMid.rotation.x = Math.PI / 2;
    bandMid.position.set(0, 0.015, -0.3);
    const bandBreech = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.014, 8), matSteel());
    bandBreech.rotation.x = Math.PI / 2;
    bandBreech.position.set(0, 0.015, 0.02);
    // front sight nub on top of the barrel near the muzzle
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.006), matSteel());
    sight.position.set(0, 0.03, -0.48);
    // stock profile: fore-stock + tapered wrist + angled butt + steel butt plate
    const foreStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.5), matWood());
    foreStock.position.set(0, -0.03, -0.02);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.055, 0.14), matWood());
    wrist.position.set(0, -0.055, 0.14);
    wrist.rotation.x = 0.22;
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.2), matWood());
    butt.position.set(0, -0.085, 0.26);
    butt.rotation.x = 0.5;
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.112, 0.008), matSteel());
    buttPlate.position.set(0, -0.133, 0.348);
    buttPlate.rotation.x = 0.5;
    // lock assembly on the right of the breech: plate, pan, frizzen, serpentine
    const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.12), matSteel());
    lockPlate.position.set(0.024, 0.0, 0.14);
    const pan = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.032), matBrass(this.#trim.bind(this)));
    pan.position.set(0.02, 0.028, 0.12);
    const frizzen = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.045, 0.018), matSteel());
    frizzen.position.set(0.026, 0.045, 0.1);
    frizzen.rotation.x = -0.35;
    // matchlock serpentine hint: two small bent plates above the lock plate
    const serpentine = new THREE.Group();
    const serpA = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.012), matBrass(this.#trim.bind(this)));
    serpA.rotation.z = 0.5;
    const serpB = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.012), matBrass(this.#trim.bind(this)));
    serpB.position.set(0.012, 0.028, 0);
    serpB.rotation.z = -0.4;
    serpentine.add(serpA, serpB);
    serpentine.position.set(0.028, 0.04, 0.17);
    // trigger + guard loop under the wrist
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.026, 0.01), matSteel());
    trigger.position.set(0, -0.08, 0.1);
    trigger.rotation.x = 0.2;
    const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0035, 5, 12), matSteel());
    triggerGuard.rotation.y = Math.PI / 2;
    triggerGuard.position.set(0, -0.082, 0.1);
    // wooden ramrod under the barrel
    const ramrod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 6), matRamrodWood());
    ramrod.rotation.x = Math.PI / 2;
    ramrod.position.set(0, -0.022, RAMROD_BASE_Z);

    // muzzle flash: two crossed additive quads + a small glow quad at the tip
    const flashGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const flashA = new THREE.Mesh(flashGeo, matFlash(this.#flashMaterials));
    const flashB = new THREE.Mesh(flashGeo, matFlash(this.#flashMaterials));
    flashB.rotation.z = Math.PI / 4;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), matFlashGlow(this.#flashMaterials));
    for (const flash of [flashA, flashB, glow]) {
      flash.position.set(0, 0.015, -0.56);
      flash.visible = false;
      group.add(flash);
      this.#flashMeshes.push(flash);
    }

    group.add(
      barrel, band, bandMid, bandBreech, sight,
      foreStock, wrist, butt, buttPlate,
      lockPlate, pan, frizzen, serpentine,
      trigger, triggerGuard, ramrod,
    );
    return { group, ramrod };
  }

  #buildCrossbow(): { group: THREE.Group; prod: THREE.Group } {
    const group = new THREE.Group();
    group.name = "vm-crossbow";

    // wooden tiller with a raised cheek comb toward the rear
    const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.58), matWood());
    tiller.position.set(0, -0.02, -0.02);
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.024, 0.18), matWood());
    cheek.position.set(0, 0.018, 0.15);
    cheek.rotation.x = -0.06;
    // bolt groove hint
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.5), matRamrodWood());
    groove.position.set(0, 0.011, -0.04);
    // The whole fallback sits in the same motion wrapper as the authored GLB.
    // The downloaded crossbow is a one-piece mesh, so moving only the fallback
    // prod would make firing behavior differ depending on load timing.
    const snap = new THREE.Group();
    snap.name = "vm-crossbow-snap";
    // back-swept steel prod: center + two tapering segments per side, tips forward
    const prod = new THREE.Group();
    const prodCenter = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.014), matSteel());
    const prodInnerL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.017, 0.012), matSteel());
    prodInnerL.position.set(-0.131, 0, -0.0223);
    prodInnerL.rotation.y = -0.35;
    const prodInnerR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.017, 0.012), matSteel());
    prodInnerR.position.set(0.131, 0, -0.0223);
    prodInnerR.rotation.y = 0.35;
    const prodOuterL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.013, 0.01), matSteel());
    prodOuterL.position.set(-0.2323, 0, -0.0821);
    prodOuterL.rotation.y = -0.75;
    const prodOuterR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.013, 0.01), matSteel());
    prodOuterR.position.set(0.2323, 0, -0.0821);
    prodOuterR.rotation.y = 0.75;
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.016, 0.016), matSteel());
    tipL.position.set(-0.2726, 0, -0.1196);
    const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.016, 0.016), matSteel());
    tipR.position.set(0.2726, 0, -0.1196);
    prod.add(prodCenter, prodInnerL, prodInnerR, prodOuterL, prodOuterR, tipL, tipR);
    prod.position.set(0, 0.01, -0.3);
    // taut string tip-to-tip across the nose
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.545, 4), matString());
    string.rotation.z = Math.PI / 2;
    string.position.set(0, 0.01, -0.42);
    // nut (bolt catch) across the groove + small steel clip holding the bolt
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.032, 8), matSteel());
    nut.rotation.z = Math.PI / 2;
    nut.position.set(0, 0.012, 0.06);
    const boltClip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.05), matSteel());
    boltClip.position.set(0, 0.02, -0.01);
    boltClip.rotation.x = 0.08;
    // trigger lever under the tiller
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.035, 0.04), matSteel());
    lever.position.set(0, -0.062, 0.1);
    lever.rotation.x = 0.35;
    // stirrup at the nose
    const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 6, 12), matSteel());
    stirrup.rotation.x = Math.PI / 2;
    stirrup.position.set(0, -0.045, -0.33);
    // bolt resting in the groove
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 6), matRamrodWood());
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(0, 0.017, -0.14);

    snap.add(tiller, cheek, groove, prod, string, nut, boltClip, lever, stirrup, bolt);
    group.add(snap);
    return { group, prod: snap };
  }

  #buildSaber(): THREE.Group {
    const group = new THREE.Group();
    group.name = "vm-saber";
    group.position.set(...BLADE_POS);
    group.rotation.set(BLADE_TILT_X, BLADE_YAW_Y, 0);

    // grip + brass guard
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.11, 6), matRamrodWood());
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.03), matBrass(this.#trim.bind(this)));
    guard.position.set(0, 0.06, 0);
    // curved blade: four progressively rotated box segments + tip
    const blade = new THREE.Group();
    let parent = blade;
    let y = 0.07;
    for (let i = 0; i < 4; i += 1) {
      const segment = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.19, 0.032 - i * 0.005), matBrightSteel());
      segment.position.set(0, 0.095, 0);
      const pivot = new THREE.Group();
      pivot.position.set(0, y, 0);
      pivot.rotation.z = -0.12 * i;
      pivot.add(segment);
      parent.add(pivot);
      parent = pivot;
      y = 0.19;
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 4), matBrightSteel());
    tip.position.set(0, 0.22, 0);
    tip.scale.z = 0.4;
    parent.add(tip);

    group.add(grip, guard, blade);
    return group;
  }

  #buildSword(): THREE.Group {    const group = new THREE.Group();
    group.name = "vm-sword";
    group.position.set(...BLADE_POS);
    group.rotation.set(BLADE_TILT_X, BLADE_YAW_Y, 0);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.12, 6), matRamrodWood());
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), matSteel());
    pommel.position.set(0, -0.07, 0);
    // straight crossguard
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.014, 0.028), matBrass(this.#trim.bind(this)));
    crossguard.position.set(0, 0.065, 0);
    // straight double-fuller blade (two stacked boxes for a taper)
    const bladeLower = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.3, 0.05), matBrightSteel());
    bladeLower.position.set(0, 0.22, 0);
    const bladeUpper = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.28, 0.032), matBrightSteel());
    bladeUpper.position.set(0, 0.5, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 4), matBrightSteel());
    tip.position.set(0, 0.67, 0);
    tip.scale.z = 0.35;

    group.add(grip, pommel, crossguard, bladeLower, bladeUpper, tip);
    return group;
  }

  /** Byzantine slot-1 fallback: a compact flanged mace until the authored GLB loads. */
  #buildMace(): THREE.Group {
    const group = new THREE.Group();
    group.name = "vm-mace";
    group.position.set(...BLADE_POS);
    group.rotation.set(BLADE_TILT_X, BLADE_YAW_Y, 0);

    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.62, 7), matWornWood());
    haft.position.y = 0.28;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.045, 8), matBrass(this.#trim.bind(this)));
    collar.position.y = 0.58;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), matSteel());
    head.position.y = 0.66;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 8), matBrightSteel());
    cap.position.y = 0.73;
    group.add(haft, collar, head, cap);
    return group;
  }

  /** Sidearm dagger (8e-3 slot 3): the sword silhouette shrunk to a knife. */
  #buildDagger(): THREE.Group {
    const group = new THREE.Group();
    group.name = "vm-dagger";
    group.position.set(...BLADE_POS);
    group.rotation.set(BLADE_TILT_X, BLADE_YAW_Y, 0);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.011, 0.09, 6), matRamrodWood());
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.01, 0.02), matBrass(this.#trim.bind(this)));
    guard.position.set(0, 0.05, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.2, 0.028), matBrightSteel());
    blade.position.set(0, 0.15, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, 4), matBrightSteel());
    tip.position.set(0, 0.28, 0);
    tip.scale.z = 0.35;

    group.add(grip, guard, blade, tip);
    return group;
  }

  #buildLance(): { group: THREE.Group; pennonMaterial: THREE.MeshStandardMaterial } {
    const group = new THREE.Group();
    group.name = "vm-lance";
    group.position.set(0.14, -0.02, 0.02);
    group.rotation.set(-0.08, 0.12, 0);

    // long wooden pole couched under the arm, steel tip, faction pennon
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 1.6, 7), matWood());
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0, 0, -0.45);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 6), matBrightSteel());
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, 0, -1.3);
    const pennonMaterial = new THREE.MeshStandardMaterial({
      color: PENNON_OTTOMAN,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    this.#trimMaterials.push({ material: pennonMaterial, defaultColor: PENNON_OTTOMAN });
    const pennon = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), pennonMaterial);
    pennon.position.set(0.08, 0.01, -1.18);

    group.add(pole, tip, pennon);
    return { group, pennonMaterial };
  }

  #buildDrum(): THREE.Group {
    const group = new THREE.Group();
    group.name = "vm-drum";
    group.position.set(-0.05, -0.12, -0.18);
    group.rotation.x = 0.15;

    // shell + pale heads + rope tension hints + two sticks
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 12), matWood());
    const headTop = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.148, 0.008, 12), matDrumHead());
    headTop.position.y = 0.1;
    const headBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.148, 0.008, 12), matDrumHead());
    headBottom.position.y = -0.1;
    const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xcbb98a, roughness: 0.9 });
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const rope = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.22, 0.006), ropeMaterial);
      rope.position.set(Math.cos(angle) * 0.152, 0, Math.sin(angle) * 0.152);
      rope.rotation.z = Math.cos(angle) * 0.15;
      rope.rotation.x = -Math.sin(angle) * 0.15;
      group.add(rope);
    }
    const stickMaterial = matRamrodWood();
    const stickLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 5), stickMaterial);
    stickLeft.position.set(-0.09, 0.2, 0.02);
    stickLeft.rotation.z = 0.7;
    const stickRight = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 5), stickMaterial);
    stickRight.position.set(0.09, 0.2, 0.02);
    stickRight.rotation.z = -0.7;

    group.add(shell, headTop, headBottom, stickLeft, stickRight);
    return group;
  }

  #buildStandard(): THREE.Group {
    const group = new THREE.Group();
    group.name = "vm-standard";
    group.position.set(0.05, -0.02, -0.05);

    // pole + crossbar + gold cross finial + small imperial banner
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 1.1, 6), matWood());
    pole.position.set(0, 0.25, 0);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.014, 0.014), matWood());
    crossbar.position.set(0, 0.72, 0);
    const finialA = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.09, 0.014), matGold(this.#trim.bind(this)));
    finialA.position.set(0, 0.85, 0);
    const finialB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.014), matGold(this.#trim.bind(this)));
    finialB.position.set(0, 0.86, 0);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshStandardMaterial({
      color: 0x5a3a7a,
      roughness: 0.85,
      side: THREE.DoubleSide,
    }));
    banner.position.set(0, 0.63, 0.001);
    const bannerTrim = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.02, 0.004), matGold(this.#trim.bind(this)));
    bannerTrim.position.set(0, 0.55, 0);

    group.add(pole, crossbar, finialA, finialB, banner, bannerTrim);
    return group;
  }

  /** Entrenching tool carried blade-up (raise a mound): fresh wood, T-grip, dirt clod on the blade. */
  #buildShovelRaise(): THREE.Group {
    const group = new THREE.Group();
    group.name = "vm-shovel-raise";
    group.position.set(0.08, -0.1, 0.02);
    group.rotation.y = -0.2;

    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.7, 7), matFreshWood());
    // T-handle at the butt
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.14, 6), matFreshWood());
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, -0.36, 0);
    // steel collar where the blade sockets onto the haft
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 7), matSteel());
    collar.position.set(0, 0.33, 0);
    const blade = new THREE.Mesh(makeSpadeBladeGeometry(), matBrightSteel());
    blade.position.set(0, 0.33, 0);
    blade.rotation.x = 0.08; // slight forward rake
    // dirt clod stuck on the blade face
    const clod = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028, 0), matDirt());
    clod.position.set(0.012, 0.42, 0.008);
    clod.scale.set(1, 0.7, 0.6);

    group.add(haft, grip, collar, blade, clod);
    return group;
  }

  /** Entrenching tool carried blade-down (dig a trench): worn dark wood, D-grip, angled blade. */
  #buildShovelDig(): THREE.Group {
    const group = new THREE.Group();
    group.name = "vm-shovel-dig";
    group.position.set(0.08, -0.02, 0.02);
    group.rotation.y = -0.2;

    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.7, 7), matWornWood());
    // D-handle at the top: crossbar + half-torus loop
    const gripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 6), matWornWood());
    gripBar.rotation.z = Math.PI / 2;
    gripBar.position.set(0, 0.36, 0);
    const gripLoop = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.01, 6, 12, Math.PI), matWornWood());
    gripLoop.position.set(0, 0.36, 0);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 7), matSteel());
    collar.position.set(0, -0.33, 0);
    const blade = new THREE.Mesh(makeSpadeBladeGeometry(), matSteel());
    blade.position.set(0, -0.33, 0);
    blade.rotation.set(0.25, 0, Math.PI - 0.15); // tip down, slight forward rake + cant

    group.add(haft, gripBar, gripLoop, collar, blade);
    return group;
  }
}

type WeaponSlot =
  | "arquebus" | "crossbow" | "lance" | "saber" | "sword" | "mace" | "dagger" | "drum" | "standard"
  | "shovelRaise" | "shovelDig";

/**
 * Fits a weapon glb for the first-person rig: rotates the longest axis onto
 * +Y (blade up), grounds the guard at the origin, and scales to lengthMeters.
 */
function bladeFit(geometry: THREE.BufferGeometry, lengthMeters: number): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return;
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.x >= size.y && size.x >= size.z) geometry.rotateZ(Math.PI / 2);
  else if (size.z >= size.y && size.z >= size.x) geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const fitted = geometry.boundingBox;
  if (fitted === null) return;
  const height = Math.max(fitted.max.y - fitted.min.y, 1e-6);
  const scale = lengthMeters / height;
  geometry.translate(-(fitted.min.x + fitted.max.x) / 2, -fitted.min.y, -(fitted.min.z + fitted.max.z) / 2);
  geometry.scale(scale, scale, scale);
}

/**
 * Prepared matchlock fit. prep-characters normalizes the model to a 1.35 m
 * +X long axis; this rotates the muzzle to engine -Z, centers the bore, and
 * keeps the butt just in front of the camera-space origin.
 */
const RIFLE_GLB_METERS = 1.35;
const RIFLE_BUTT_Z = 0.28;
/** Bore line height in group space — the procedural barrel's centreline. */
const BORE_Y = 0.015;

function firearmFit(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  const before = geometry.boundingBox;
  if (before === null) return -1.05;
  const size = new THREE.Vector3();
  before.getSize(size);
  if (size.x >= size.y && size.x >= size.z) geometry.rotateY(Math.PI / 2); // +X muzzle → -Z
  else if (size.y >= size.x && size.y >= size.z) geometry.rotateX(-Math.PI / 2); // +Y muzzle → -Z
  geometry.computeBoundingBox();
  const rotated = geometry.boundingBox;
  if (rotated === null) return -1.05;
  rotated.getSize(size);
  const scale = RIFLE_GLB_METERS / Math.max(size.z, 1e-6);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const fitted = geometry.boundingBox;
  if (fitted === null) return -1.05;
  const centerX = (fitted.min.x + fitted.max.x) / 2;
  const centerY = (fitted.min.y + fitted.max.y) / 2;
  const translateZ = RIFLE_BUTT_Z - fitted.max.z;
  geometry.translate(-centerX, BORE_Y - centerY, translateZ);
  return fitted.min.z + translateZ;
}

/**
 * Prepared heavy-crossbow fit. prep-characters keeps its authored 0.85 m
 * stock on X with the prod/bolt direction at -X. Rotate that working end onto
 * engine -Z, centre the broad prod on the sight line, and keep the stock clear
 * of the camera near plane. Exported for geometry-contract regression cover.
 */
const CROSSBOW_GLB_METERS = 0.85;
const CROSSBOW_STOCK_Z = 0.26;

export function crossbowFit(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const before = geometry.boundingBox;
  if (before === null) return;
  const size = new THREE.Vector3();
  before.getSize(size);
  if (size.x >= size.y && size.x >= size.z) geometry.rotateY(-Math.PI / 2); // -X prod → -Z
  else if (size.y >= size.x && size.y >= size.z) geometry.rotateX(Math.PI / 2); // -Y prod → -Z
  geometry.computeBoundingBox();
  const rotated = geometry.boundingBox;
  if (rotated === null) return;
  rotated.getSize(size);
  const scale = CROSSBOW_GLB_METERS / Math.max(size.z, 1e-6);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  const fitted = geometry.boundingBox;
  if (fitted === null) return;
  const centerX = (fitted.min.x + fitted.max.x) / 2;
  const centerY = (fitted.min.y + fitted.max.y) / 2;
  const translateZ = CROSSBOW_STOCK_Z - fitted.max.z;
  geometry.translate(-centerX, BORE_Y - centerY, translateZ);
}

// --- base pose: bottom-right of view, scaled for FOV 72 / near 0.05 ---
const BASE_X = 0.3;
const BASE_Y = -0.3;
const BASE_Z = -0.52;

// --- ADS pose (Phase 8e-7): low cheek-weld — bore just under the sight
// line, stock into the shoulder, slight inward cant. Tuned over three probe
// screenshot rounds: y=-0.035/z=-0.42 left the butt plate 7 cm from the
// lens (giant blob); z=-0.34..-0.40 fixes that (butt plate, group z=+0.35,
// reaches the 0.05 near plane and vanishes into the shoulder). y=-0.075
// drops the matchlock serpentine (group y≈0.068 — tall enough that lowering
// alone beats canting) under the bore line at lower-right and puts the
// front-sight bead (group y≈0.036, z=-0.48) ~2.5° under the reticle. A 3°
// inward yaw shows the barrel's lit side instead of its unlit breech cap
// face-on (the "black disk" of round 1-3).
const AIM_X = 0;
const AIM_Y = -0.075;
const AIM_Z = -0.4;
const AIM_ROT_YAW = -0.05;
// Authored-matchlock shoulder pose. It is selected only after the GLB lands;
// the procedural fallback keeps AIM_* until then.
const AIM_RIFLE_X = 0;
const AIM_RIFLE_Y = -0.04;
const AIM_RIFLE_Z = -0.39;
const AIM_RIFLE_ROT_YAW = -0.05;
// Walk-bob suppression while shouldered (keeps a whisper of life).
const BOB_AIM_SCALE = 0.75;

// --- tuning: all motion subtle per the visual bible ---
const SPAWN_SECONDS = 0.9;
const SPAWN_DROP = 0.26;
const SPAWN_TILT = 0.5;
const SPAWN_OVERSHOOT = 1.1;
const MELEE_SECONDS = 0.3;
const MELEE_ROLL = 0.55;
const MELEE_YAW = 0.3;
const MELEE_SWEEP_X = 0.22;
const MELEE_LIFT = 0.06;
const RECOIL_KICK = 0.55; // spring velocity impulse → ~5 cm translate back
const RECOIL_PITCH_KICK = 0.5; // → peak ≈ 2.9°, under the 3° cap
const RECOIL_STIFFNESS = 110;
const RECOIL_DAMPING = 13;
const PROD_SNAP_KICK = 0.35;
const PROD_STIFFNESS = 140;
const PROD_DAMPING = 11;
// Fixed integration sub-step for the viewmodel springs (Phase 8c-5b),
// matching cameraFeel.ts. Far below the 2/max(damping) = 154 ms stability
// limit, so the settle shape is frame-rate independent.
const SPRING_SUB_STEP = 1 / 240;
const PROD_SPAN_PULL = 0.09;
const FLASH_SECONDS = 0.09; // Phase 8e-1: 60 → 90 ms so the flash reads at 25 fps
const FLASH_BASE_SCALE = 1.35;
const RELOAD_DROP = 0.14;
const RELOAD_TILT = 0.35; // ≈ 20°
const CRANK_ROCK = 0.05;
const RAMROD_BASE_Z = -0.18;
const RAMROD_TRAVEL = 0.09;
const BOB_BASE_FREQ = 4;
const BOB_RUN_FREQ = 7;
const BOB_REST_AMP = 0.002;
const BOB_RUN_AMP = 0.004;
const SHOVEL_TOTAL_SECONDS = 1.2; // swing + hold, then the previous loadout is restored
const SHOVEL_SWING_SECONDS = 0.65;
const SHOVEL_ANT = 0.22; // fraction of the swing spent on anticipation
const SHOVEL_STRIKE = 0.55; // fraction where the strike peaks and the settle begins
const SHOVEL_ANT_DIP = 0.03;
const SHOVEL_ANT_LIFT = 0.035;
const SHOVEL_ANT_TILT = 0.1;
const SHOVEL_HEAVE = 0.14; // raise: upward heave translate
const SHOVEL_HEAVE_TILT = 0.45; // ≈ 26° tip-back
const SHOVEL_CHOP = 0.17; // dig: downward chop translate
const SHOVEL_CHOP_TILT = 0.5;
const SHOVEL_CHOP_PUSH = 0.05; // slight forward push into the chop
const DENIED_SECONDS = 0.25;
const DENIED_DIP = 0.035;
// Slot switch draw/holster (8e-3) and glb blade sizes.
const SWITCH_DROP = 0.22;
const SWITCH_TILT = 0.45;
const SWORD_GLB_METERS = 0.85;
const MACE_GLB_METERS = 0.78;
const DAGGER_GLB_METERS = 0.45;
// Foot blade pose (8e-3): gripped low-right, blade angled forward across the
// frame — straight up reads as a wall of steel filling the view at arm's length.
const BLADE_POS: readonly [number, number, number] = [0.14, -0.14, 0.02];
const BLADE_TILT_X = -0.55; // tip forward ≈ 31°
const BLADE_YAW_Y = -0.5; // angled across the frame
const DENIED_TWIST = 0.12;
const PENNON_OTTOMAN = 0xb03a30;
const PENNON_BYZANTINE = 0x5a3a7a;

/** Deterministic 0..1 hash of a shot counter — no RNG, reproducible jitter. */
function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/** easeOutBack with a gentle overshoot — used for the spawn rotate-settle. */
function easeOutBack(t: number, overshoot: number): number {
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

/** Damped spring settle from displaced (1) back to rest (0) with one overshoot — shovel swing recovery. */
function springSettle(u: number): number {
  return Math.cos(u * Math.PI * 2.2) * Math.exp(-u * 4);
}

/** 0→1 hold →1 curve for the reload lower-weapon pose (dip, hold, rise). */
function reloadHold(p: number): number {
  if (p < 0.2) return easeOutCubic(p / 0.2);
  if (p > 0.8) return 1 - easeOutCubic((p - 0.8) / 0.2);
  return 1;
}

// --- shared materials (flat colors, MeshStandardMaterial so dawn light reads) ---
let steelMaterial: THREE.MeshStandardMaterial | undefined;
let brightSteelMaterial: THREE.MeshStandardMaterial | undefined;
let woodMaterial: THREE.MeshStandardMaterial | undefined;
let ramrodWoodMaterial: THREE.MeshStandardMaterial | undefined;
let stringMaterial: THREE.MeshStandardMaterial | undefined;
let drumHeadMaterial: THREE.MeshStandardMaterial | undefined;
let freshWoodMaterial: THREE.MeshStandardMaterial | undefined;
let wornWoodMaterial: THREE.MeshStandardMaterial | undefined;
let dirtMaterial: THREE.MeshStandardMaterial | undefined;

function matSteel(): THREE.MeshStandardMaterial {
  steelMaterial ??= new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.8, roughness: 0.4 });
  return steelMaterial;
}

function matBrightSteel(): THREE.MeshStandardMaterial {
  brightSteelMaterial ??= new THREE.MeshStandardMaterial({ color: 0xc4c9c7, metalness: 0.7, roughness: 0.3 });
  return brightSteelMaterial;
}

function matWood(): THREE.MeshStandardMaterial {
  woodMaterial ??= new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.75 });
  return woodMaterial;
}

function matRamrodWood(): THREE.MeshStandardMaterial {
  ramrodWoodMaterial ??= new THREE.MeshStandardMaterial({ color: 0x8a6b42, roughness: 0.8 });
  return ramrodWoodMaterial;
}

function matString(): THREE.MeshStandardMaterial {
  stringMaterial ??= new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.9 });
  return stringMaterial;
}

function matDrumHead(): THREE.MeshStandardMaterial {
  drumHeadMaterial ??= new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.9 });
  return drumHeadMaterial;
}

/** Flat spade blade profile extruded thin: wide shoulders, slight taper, rounded-square tip. Origin at the socket, +Y toward the tip. */
function makeSpadeBladeGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.045, 0);
  shape.lineTo(-0.048, 0.1);
  shape.quadraticCurveTo(-0.048, 0.16, -0.03, 0.19);
  shape.quadraticCurveTo(-0.015, 0.21, 0, 0.21);
  shape.quadraticCurveTo(0.015, 0.21, 0.03, 0.19);
  shape.quadraticCurveTo(0.048, 0.16, 0.048, 0.1);
  shape.lineTo(0.045, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -0.002);
  return geometry;
}

function matFreshWood(): THREE.MeshStandardMaterial {
  freshWoodMaterial ??= new THREE.MeshStandardMaterial({ color: 0x9a6a38, roughness: 0.7 });
  return freshWoodMaterial;
}

function matWornWood(): THREE.MeshStandardMaterial {
  wornWoodMaterial ??= new THREE.MeshStandardMaterial({ color: 0x4c3823, roughness: 0.85 });
  return wornWoodMaterial;
}

function matDirt(): THREE.MeshStandardMaterial {
  dirtMaterial ??= new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 1 });
  return dirtMaterial;
}

/** Brass trim — registered for setSkinTint via the provided registrar. */
function matBrass(register: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  return register(new THREE.MeshStandardMaterial({ color: 0xb08d3f, metalness: 0.6, roughness: 0.35 }));
}

/** Gold trim — registered for setSkinTint via the provided registrar. */
function matGold(register: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  return register(new THREE.MeshStandardMaterial({ color: 0xd5b554, metalness: 0.65, roughness: 0.3 }));
}

function matFlash(registry: THREE.MeshBasicMaterial[]): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffc873,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  registry.push(material);
  return material;
}

function matFlashGlow(registry: THREE.MeshBasicMaterial[]): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff1c9,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  registry.push(material);
  return material;
}
