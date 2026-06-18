output "traffic_manager_dns" {
  description = "Traffic Manager DNS name for UAT Tester"
  value       = "${azurerm_traffic_manager_profile.main.name}.trafficmanager.net"
}

output "primary_region" {
  description = "Primary region deployment"
  value = {
    location          = module.primary.location
    vm_name           = module.primary.vm_name
    public_ip_address = module.primary.public_ip_address
  }
}

output "secondary_region" {
  description = "Secondary region deployment"
  value = {
    location          = module.secondary.location
    vm_name           = module.secondary.vm_name
    public_ip_address = module.secondary.public_ip_address
  }
}
