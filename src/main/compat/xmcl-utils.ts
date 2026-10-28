// XMCL's published installer imports this predicate from an unpublished subpath.
export function isNotNull<T>(value:T|null|undefined):value is T { return value!==null && value!==undefined; }
