#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace padpilot {

struct ModuleRecord {
  std::string id;
  std::string name;
  std::string version;
  std::string entryPath;
  std::string scriptEntryPath;
  std::string installRootPath;
  std::string manifestPath;
  std::string apiVersion;
  std::string checksum;
  std::string installedAt;
  std::vector<std::string> capabilities;
  std::string loadStatus;
  std::string loadErrorMessage;
  std::string expectedModuleVersion;
  std::string resolvedModuleVersion;
  std::uint32_t stateSchemaVersion {1};
  std::uint32_t expectedStateSchemaVersion {1};
};

class ModuleStore {
 public:
  ModuleStore();
  explicit ModuleStore(std::string modulesRootPath);
  std::vector<ModuleRecord> loadAllModules() const;
  bool saveModule(const ModuleRecord& module) const;
  ModuleRecord createDefaultModule(const std::string& name) const;
  std::optional<ModuleRecord> installBundle(const std::string& bundleArchivePath,
                                            std::string& errorMessage) const;
  ModuleRecord hydrateModuleRecord(const ModuleRecord& module) const;
  ModuleRecord restorePersistedModuleReference(
      const ModuleRecord& persistedModule,
      const std::vector<ModuleRecord>& installedModules) const;
  std::optional<std::string> resolveWebResourcePath(const std::string& webPath) const;
  std::string getModulesRootPath() const;

 private:
  std::string modulesRootPath_;
  std::string registryRootPath_;
  std::string installedRootPath_;
  bool storageRootsReady_ {false};
};

}  // namespace padpilot
