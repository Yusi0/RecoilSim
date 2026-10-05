import { AttachmentEffectResolver } from '../src/core/compiler/AttachmentEffectResolver';

const resolver = AttachmentEffectResolver.createDefault();

const fixtures = [
  { id: 'fast_mag_41e0f157', name: 'Fast Mag', wep: 'mcx_virtus' },
  { id: 'extended_magazine_06142feb', name: 'Extended Magazine', wep: 'aug_a3' },
  { id: 'reduced_magazine_749d7cfe', name: 'Reduced Magazine', wep: 'hk416a5' },
  { id: 'groza_5_45_conversion_e1bc57b6', name: 'Groza 5.45 Conversion', wep: 'groza_1' },
  { id: 'mts_570_conversion_086fac7b', name: 'MTS-570 Conversion', wep: 'mts_569' },
  { id: 'ar_20_tact_conversion_8cadf7c4', name: 'AR 20 Tact Conversion', wep: 'c25' },
  { id: 'aku_9mm_conversion_b01d7102', name: 'AKU 9mm Conversion', wep: 'aku12' }
];

for (const f of fixtures) {
  const res = resolver.resolveAttachmentForWeapon(f.id, f.wep);
  console.log('====================================');
  console.log('Attachment:', f.name, `(${f.wep})`);
  console.log(JSON.stringify(res.changes.reloadEffects, null, 2));
}
