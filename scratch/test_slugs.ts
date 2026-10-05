import { AttachmentEffectResolver } from '../src/core/compiler/AttachmentEffectResolver';

const resolver = AttachmentEffectResolver.createDefault();
const res = resolver.resolveAttachmentForWeapon('slugs_aac11a15', 'remington_870');
console.log('Slugs status:', res.status);
console.log('Slugs pelletCount:', res.changes.pelletCount);
console.log('Slugs changes keys:', Object.keys(res.changes));
