import { useEffect } from 'react';

/**
 * Hook to dynamically update the document title, favicon, and OG meta tags
 * @param {string} title 
 * @param {string} faviconUrl 
 * @param {object} ogMeta - { image, description }
 */
export function useDynamicBranding(title, faviconUrl, ogMeta) {
  useEffect(() => {
    if (title) {
      document.title = title;
    }

    const activeFavicon = '/logo.png';
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = activeFavicon;

    // Update OG meta tags dynamically
    if (ogMeta) {
      if (title) {
        setMeta('og:title', title);
        setMeta('twitter:title', title);
      }
      if (ogMeta.description) {
        setMeta('og:description', ogMeta.description);
        setMeta('twitter:description', ogMeta.description);
      }
      if (ogMeta.image) {
        setMeta('og:image', ogMeta.image);
        setMeta('twitter:image', ogMeta.image);
        setMeta('twitter:card', 'summary_large_image');
      }
    }
  }, [title, faviconUrl, ogMeta?.image, ogMeta?.description]);
}

function setMeta(property, content) {
  // Check for both property and name attributes (OG uses property, Twitter uses name)
  let meta = document.querySelector(`meta[property='${property}']`) || 
             document.querySelector(`meta[name='${property}']`);
  if (!meta) {
    meta = document.createElement('meta');
    if (property.startsWith('og:')) {
      meta.setAttribute('property', property);
    } else {
      meta.setAttribute('name', property);
    }
    document.getElementsByTagName('head')[0].appendChild(meta);
  }
  meta.setAttribute('content', content);
}
