# DNS and browser setup

go-router works best at an internal fully-qualified name such as `go.corp.example`. A Kubernetes Service or Ingress alone does not make the name resolvable from employee devices; connect the client network to the VPC and configure authoritative private DNS or forwarding.

## Bare `go` names

DNS records cannot force clients to expand an unqualified name. To make `http://go/...` resolve, configure `corp.example` as a DNS search suffix through DHCP, VPN, device management, or the operating system. Then a client resolver can try `go.corp.example` when asked for `go`.

Browsers increasingly prefer HTTPS and may treat a bare word as a search query. A fully-qualified HTTPS URL or custom search shortcut is more predictable.

## Browser custom search

Use this template, replacing the hostname:

```text
https://go.corp.example/?q=%s
```

### Chromium browsers

Open **Settings → Search engine → Manage search engines and site search**, add a site search named `go`, choose a shortcut such as `go`, and paste the template above. Typing `go` followed by Tab or Space and then `docs onboarding` sends the whole query to go-router.

### Firefox

Create a bookmark whose URL is the template and whose keyword is `go`. Typing `go docs onboarding` in the address bar invokes it.

Managed-browser administrators can distribute equivalent enterprise search-provider policies. No go-router browser extension is required.

## Internal HTTP and TLS

The Terraform reference defaults to a regional internal L4 load balancer and HTTP because private certificate policy varies by organization. If `tls_secret_name` is supplied, it instead creates an internal GKE Ingress, reserves a regional static internal address, disables plain HTTP on the Ingress, and uses that pre-existing Kubernetes TLS secret.

A public certificate authority generally cannot validate a private single-label hostname. Use an organizational CA, a certificate for a controlled private FQDN, and managed client trust. Never promise or rely on public TLS for `https://go`.
