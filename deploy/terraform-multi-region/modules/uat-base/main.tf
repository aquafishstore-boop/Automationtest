/**
 * Base UAT Tester Module
 * Deploys: VM + Docker + Cloudflare Tunnel in a single region
 */

variable "location" {
  description = "Azure region"
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "environment" {
  description = "Environment name (primary/secondary)"
  type        = string
}

variable "suffix" {
  description = "Unique suffix for resource naming"
  type        = string
}

variable "admin_username" {
  description = "VM admin username"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key"
  type        = string
  sensitive   = true
}

variable "vnet_address_space" {
  description = "VNet address space"
  type        = list(string)
}

variable "subnet_address_prefix" {
  description = "Subnet address prefix"
  type        = list(string)
}

# Resource group
resource "azurerm_resource_group" "this" {
  name     = "${var.resource_group_name}-${var.environment}"
  location = var.location
}

# Virtual Network
resource "azurerm_virtual_network" "this" {
  name                = "vnet-uat-${var.environment}-${var.suffix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  address_space       = var.vnet_address_space
}

# Subnet
resource "azurerm_subnet" "this" {
  name                 = "snet-uat-${var.environment}"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = var.subnet_address_prefix
}

# Public IP
resource "azurerm_public_ip" "this" {
  name                = "pip-uat-${var.environment}-${var.suffix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

# Network Security Group
resource "azurerm_network_security_group" "this" {
  name                = "nsg-uat-${var.environment}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name

  security_rule {
    name                       = "SSH"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefixes    = var.ssh_allowed_cidrs
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "HTTPS"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AppHealthCheck"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "3001"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "*"
  }
}

variable "ssh_allowed_cidrs" {
  description = "CIDR ranges allowed for SSH access"
  type        = list(string)
  default     = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
}

# Network Interface
resource "azurerm_network_interface" "this" {
  name                = "nic-uat-${var.environment}-${var.suffix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.this.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.this.id
  }
}

# VM
resource "azurerm_linux_virtual_machine" "this" {
  name                  = "vm-uat-${var.environment}-${var.suffix}"
  location              = azurerm_resource_group.this.location
  resource_group_name   = azurerm_resource_group.this.name
  network_interface_ids = [azurerm_network_interface.this.id]
  size                  = "Standard_D4s_v5"

  os_disk {
    name                 = "osdisk-uat-${var.environment}-${var.suffix}"
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
    disk_size_gb         = 128
  }

  source_image_reference {
    publisher = "canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  computer_name  = "uat-${var.environment}"
  admin_username = var.admin_username

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.ssh_public_key
  }

  boot_diagnostics {
    storage_account_uri = null
  }

  tags = {
    Environment = var.environment
    Application = "UAT Tester"
    ManagedBy   = "Terraform"
  }
}

# Cloud-init config for Docker + app setup
resource "azurerm_virtual_machine_extension" "setup" {
  name                 = "setup-uat"
  virtual_machine_id   = azurerm_linux_virtual_machine.this.id
  publisher            = "Microsoft.Azure.Extensions"
  type                 = "CustomScript"
  type_handler_version = "2.1"

  settings = jsonencode({
    script = base64encode(templatefile("${path.module}/setup.sh", {
      admin_username = var.admin_username
      environment    = var.environment
    }))
  })
}

output "vm_name" {
  value = azurerm_linux_virtual_machine.this.name
}

output "public_ip_id" {
  value = azurerm_public_ip.this.id
}

output "public_ip_address" {
  value = azurerm_public_ip.this.ip_address
}

output "location" {
  value = azurerm_resource_group.this.location
}
