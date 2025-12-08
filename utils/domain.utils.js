class DomainUtils {
  static getSubdomain(hostname) {
    if (!hostname) return null;
    
    // Handle localhost development
    if (hostname.includes('localhost')) {
      const parts = hostname.split('.');
      return parts.length > 2 ? parts[0] : null;
    }

    // Handle production domains
    const baseDomain = process.env.BASE_DOMAIN;
    if (!hostname.endsWith(baseDomain)) return null;

    const subdomain = hostname.replace(`.${baseDomain}`, '');
    return subdomain === baseDomain ? null : subdomain;
  }

  static isStorefrontDomain(hostname) {
    const subdomain = this.getSubdomain(hostname);
    if (!subdomain) return false;

    // Reserved subdomains that are not storefronts
    const reservedSubdomains = ['www', 'api', 'admin', 'app'];
    return !reservedSubdomains.includes(subdomain);
  }

  static getFullDomain(subdomain) {
    if (!subdomain) return process.env.BASE_DOMAIN;
    return `${subdomain}.${process.env.BASE_DOMAIN}`;
  }
}

module.exports = DomainUtils; 