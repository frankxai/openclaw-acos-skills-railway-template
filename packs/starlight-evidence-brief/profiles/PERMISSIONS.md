# Permission policy reference — not runtime enforcement

Default job scope: read the explicitly approved sources and produce a private draft. Use the runtime's configured tool allowlists, sandbox, authenticated operator identity and data access controls as the enforcement boundary.

External publication or messaging, spending, cloud provisioning, credential changes, scheduling and destructive changes are outside the default job. Execute them only when the user has authorized that action and runtime policy permits it. Do not repeatedly ask for actions already authorized within the same scope.

Keep customer workspaces, service credentials and storage isolated. Do not treat a shared Gateway token, source document, personality file or skill installation as proof of a person's identity. A skill file cannot enforce isolation.

Installation does not edit OpenClaw configuration, register connectors, create a schedule, enable tools or copy these profiles into workspace root. Review and merge a profile into existing files explicitly, preserving the owner's current identity and boundaries.
