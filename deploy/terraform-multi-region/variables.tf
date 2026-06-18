variable "resource_group_name" {
  description = "Azure resource group name"
  type        = string
  default     = "rg-uat-tester"
}

variable "admin_username" {
  description = "VM admin username"
  type        = string
  default     = "aetheris"
}

variable "ssh_public_key" {
  description = "SSH public key for VM access"
  type        = string
  sensitive   = true
}
