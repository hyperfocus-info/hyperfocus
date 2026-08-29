# Marketplace Distributed Admission Control

- Owner: Marketplace/backend
- Deadline: Before the first multi-replica production deployment
- Status: Blocked on a shared coordination-store decision

## Problem

Marketplace request-rate buckets and active upload, download, and generator permits are process-local. Running multiple Bun replicas multiplies those limits and removes the intended global backpressure.

Until this task is complete, production must run exactly one Marketplace process for each SQLite/upload root behind a single ingress.

## Exit Criteria

- Request-rate buckets use an atomic shared store with bounded retention.
- Upload, download, and generator permits use shared leases with crash-safe expiry.
- Lease ownership and expiry use a monotonic or server-authoritative clock.
- Multi-process integration tests prove aggregate limits, lease release, and recovery after a worker terminates.
- Marketplace deployment documentation permits multiple replicas only after those tests pass.
