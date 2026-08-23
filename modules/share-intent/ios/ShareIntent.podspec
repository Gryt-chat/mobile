Pod::Spec.new do |s|
  s.name           = 'ShareIntent'
  s.version        = '1.0.0'
  s.summary        = 'Reads a share handed to Gryt by another app.'
  s.description    = 'Reads a share handed to Gryt by another app.'
  s.author         = 'Gryt'
  s.homepage       = 'https://gryt.chat'
  s.license        = { :type => 'AGPL-3.0' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Gryt-chat/mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
