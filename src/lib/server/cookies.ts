// Our cookies' names. On the real site they carry the __Host- prefix, so a
// browser only takes them from this exact address, over HTTPS, for the whole
// site: a neighbouring subdomain can't plant or overwrite one (someone else's
// session, an invite, which household you're working in).
import { config } from './config';

export const cookieName = (base: string) => (config.isProduction ? `__Host-${base}` : base);
